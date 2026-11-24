import "server-only";
import { db } from "../lib/db";
import { audit } from "../lib/audit";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { addDays, dateOnly, isoWeekday, localDateString, toYmd } from "../lib/time";
import type { SessionUser } from "../lib/session";
import { getDefaultSchedule, getSettings, snapshotOf } from "./settings";
import { notify, notifyAdmins } from "./notifications";

const MAX_RANGE_DAYS = 60;
const MAX_BACKDATE_DAYS = 30;

export function countLeaveDays(start: string, end: string, workDays: number[], halfDay: boolean) {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (workDays.includes(isoWeekday(d))) n++;
  return halfDay ? (n > 0 ? 0.5 : 0) : n;
}

async function scheduleFor(employeeId: string) {
  const e = await db.employee.findUnique({ where: { id: employeeId }, include: { workSchedule: true } });
  if (!e) throw notFound("Employee not found");
  return { employee: e, schedule: snapshotOf(e.workSchedule ?? (await getDefaultSchedule())) };
}

export async function ensureBalances(employeeId: string, year: number) {
  const types = await db.leaveType.findMany({ where: { isActive: true } });
  for (const t of types) {
    await db.leaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: t.id, year } },
      update: {},
      create: { employeeId, leaveTypeId: t.id, year, allocated: t.defaultDays },
    });
  }
}

export async function getBalances(employeeId: string, year: number) {
  await ensureBalances(employeeId, year);
  const [balances, pending] = await Promise.all([
    db.leaveBalance.findMany({
      where: { employeeId, year, leaveType: { isActive: true } },
      include: { leaveType: true },
      orderBy: { leaveType: { name: "asc" } },
    }),
    db.leaveRequest.groupBy({
      by: ["leaveTypeId"],
      where: {
        employeeId,
        status: "PENDING",
        startDate: { gte: dateOnly(`${year}-01-01`), lte: dateOnly(`${year}-12-31`) },
      },
      _sum: { days: true },
    }),
  ]);
  const pendingMap = new Map(pending.map((p) => [p.leaveTypeId, p._sum.days ?? 0]));
  return balances.map((b) => ({
    id: b.id,
    year: b.year,
    leaveType: {
      id: b.leaveType.id,
      name: b.leaveType.name,
      code: b.leaveType.code,
      color: b.leaveType.color,
      isPaid: b.leaveType.isPaid,
    },
    allocated: b.allocated,
    used: b.used,
    pending: pendingMap.get(b.leaveTypeId) ?? 0,
    available: Math.max(0, b.allocated - b.used - (pendingMap.get(b.leaveTypeId) ?? 0)),
  }));
}

export async function applyLeave(
  user: SessionUser,
  input: { leaveTypeId: string; startDate: string; endDate: string; halfDay: boolean; reason: string },
) {
  const employeeId = user.employee!.id;
  const settings = await getSettings();
  const today = localDateString(new Date(), settings.timezone);
  if (input.startDate < addDays(today, -MAX_BACKDATE_DAYS)) {
    throw badRequest(`Leave can be backdated by at most ${MAX_BACKDATE_DAYS} days.`);
  }
  if (input.endDate > addDays(input.startDate, MAX_RANGE_DAYS - 1)) {
    throw badRequest(`A single request can cover at most ${MAX_RANGE_DAYS} days.`);
  }
  if (input.startDate.slice(0, 4) !== input.endDate.slice(0, 4)) {
    throw badRequest("Leave cannot span two calendar years. Split it into two requests.");
  }

  const type = await db.leaveType.findUnique({ where: { id: input.leaveTypeId } });
  if (!type || !type.isActive) throw badRequest("Selected leave type is not available.");

  const { employee, schedule } = await scheduleFor(employeeId);
  const days = countLeaveDays(input.startDate, input.endDate, schedule.workDays, input.halfDay);
  if (days <= 0) throw badRequest("The selected dates contain no working days.");

  const overlap = await db.leaveRequest.findFirst({
    where: {
      employeeId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: dateOnly(input.endDate) },
      endDate: { gte: dateOnly(input.startDate) },
    },
  });
  if (overlap) {
    throw conflict(
      `This overlaps an existing ${overlap.status.toLowerCase()} request (${toYmd(overlap.startDate)} → ${toYmd(overlap.endDate)}).`,
    );
  }

  if (!input.halfDay) {
    const worked = await db.attendance.findFirst({
      where: {
        employeeId,
        workDate: { gte: dateOnly(input.startDate), lte: dateOnly(input.endDate) },
        status: { not: "REJECTED" },
      },
    });
    if (worked) throw conflict(`You already have attendance recorded on ${toYmd(worked.workDate)}.`);
  }

  const year = Number(input.startDate.slice(0, 4));
  if (type.isPaid) {
    const balance = (await getBalances(employeeId, year)).find((b) => b.leaveType.id === type.id);
    if (!balance || balance.available < days) {
      throw conflict(
        `Insufficient ${type.name} balance: ${balance?.available ?? 0} day(s) available, ${days} requested.`,
      );
    }
  }

  const created = await db.$transaction(async (tx) => {
    const req = await tx.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: type.id,
        startDate: dateOnly(input.startDate),
        endDate: dateOnly(input.endDate),
        halfDay: input.halfDay,
        days,
        reason: input.reason,
      },
    });
    await audit(
      {
        actorId: user.id,
        actorEmail: user.email,
        action: "leave.apply",
        entityType: "LeaveRequest",
        entityId: req.id,
        metadata: { type: type.code, startDate: input.startDate, endDate: input.endDate, days },
      },
      tx,
    );
    await notifyAdmins(
      {
        type: "LEAVE_SUBMITTED",
        title: "New leave request",
        body: `${employee.firstName} ${employee.lastName} requested ${days} day(s) of ${type.name}.`,
        link: "/admin/leaves",
      },
      tx,
    );
    return req;
  });
  return created;
}

export async function cancelLeave(user: SessionUser, id: string) {
  const req = await db.leaveRequest.findUnique({ where: { id } });
  if (!req) throw notFound("Leave request not found");
  if (req.employeeId !== user.employee?.id) throw forbidden();
  if (req.status !== "PENDING") throw conflict("Only pending requests can be cancelled.");
  await db.$transaction(async (tx) => {
    const res = await tx.leaveRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED" } });
    if (res.count !== 1) throw conflict("Request was already processed.");
    await audit(
      { actorId: user.id, actorEmail: user.email, action: "leave.cancel", entityType: "LeaveRequest", entityId: id },
      tx,
    );
  });
}

export async function reviewLeave(admin: SessionUser, id: string, decision: "APPROVE" | "REJECT", comment?: string) {
  const req = await db.leaveRequest.findUnique({
    where: { id },
    include: { leaveType: true, employee: { select: { userId: true, firstName: true, lastName: true, id: true } } },
  });
  if (!req) throw notFound("Leave request not found");
  if (req.status !== "PENDING") throw conflict(`This request is already ${req.status.toLowerCase()}.`);
  if (req.employee.userId === admin.id) throw forbidden("You cannot review your own leave request.");

  const approve = decision === "APPROVE";
  const year = req.startDate.getUTCFullYear();
  if (approve) await ensureBalances(req.employeeId, year);

  return db.$transaction(async (tx) => {
    const res = await tx.leaveRequest.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: approve ? "APPROVED" : "REJECTED",
        reviewerId: admin.id,
        reviewComment: comment || null,
        reviewedAt: new Date(),
      },
    });
    if (res.count !== 1) throw conflict("Request was already processed.");

    if (approve && req.leaveType.isPaid) {
      const bal = await tx.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, year } },
      });
      if (!bal || bal.allocated - bal.used < req.days) {
        throw conflict("Employee no longer has enough balance for this request.");
      }
      await tx.leaveBalance.update({ where: { id: bal.id }, data: { used: { increment: req.days } } });
    }

    await audit(
      {
        actorId: admin.id,
        actorEmail: admin.email,
        action: approve ? "leave.approve" : "leave.reject",
        entityType: "LeaveRequest",
        entityId: id,
        metadata: {
          employee: `${req.employee.firstName} ${req.employee.lastName}`,
          days: req.days,
          type: req.leaveType.code,
          comment: comment ?? null,
        },
      },
      tx,
    );
    await notify(
      req.employee.userId,
      {
        type: approve ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
        title: approve ? "Leave approved" : "Leave rejected",
        body: `Your ${req.leaveType.name} request (${toYmd(req.startDate)} → ${toYmd(req.endDate)}) was ${approve ? "approved" : "rejected"}.${comment ? ` Comment: ${comment}` : ""}`,
        link: "/employee/leaves",
      },
      tx,
    );
    return { id, status: approve ? "APPROVED" : "REJECTED" };
  });
}

export function serializeLeave(
  l: Awaited<ReturnType<typeof db.leaveRequest.findFirstOrThrow>> & {
    leaveType?: { id: string; name: string; color: string; code: string } | null;
    employee?: {
      id: string;
      firstName: string;
      lastName: string;
      employeeCode: string;
      avatarKey: string | null;
      department?: { name: string } | null;
    } | null;
    reviewer?: { email: string } | null;
  },
) {
  return {
    id: l.id,
    startDate: toYmd(l.startDate),
    endDate: toYmd(l.endDate),
    days: l.days,
    halfDay: l.halfDay,
    reason: l.reason,
    status: l.status,
    reviewComment: l.reviewComment,
    reviewedAt: l.reviewedAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    leaveType: l.leaveType ? { id: l.leaveType.id, name: l.leaveType.name, color: l.leaveType.color, code: l.leaveType.code } : null,
    employee: l.employee
      ? {
          id: l.employee.id,
          name: `${l.employee.firstName} ${l.employee.lastName}`,
          employeeCode: l.employee.employeeCode,
          department: l.employee.department?.name ?? null,
        }
      : null,
    reviewer: l.reviewer?.email ?? null,
  };
}
