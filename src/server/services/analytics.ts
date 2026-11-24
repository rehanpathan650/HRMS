import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { addDays, dateOnly, isoWeekday, localDateString, toYmd } from "../lib/time";
import { buildDayStatuses, employeesWithSchedules } from "./attendance";
import { getSettings, scheduledMinutes } from "./settings";
import { signedAvatar } from "./employees";

const ACTIVE = { status: { in: ["ACTIVE", "PROBATION", "NOTICE"] as ("ACTIVE" | "PROBATION" | "NOTICE")[] } };
const COUNTS_PRESENT = new Set(["PRESENT", "LATE", "HALF_DAY", "PENDING_VERIFICATION"]);

export async function adminOverview(opts: { days: number; departmentId?: string }) {
  const settings = await getSettings();
  const tz = settings.timezone;
  const today = localDateString(new Date(), tz);
  const from = addDays(today, -(opts.days - 1));
  const empWhere: Prisma.EmployeeWhereInput = { ...ACTIVE, ...(opts.departmentId ? { departmentId: opts.departmentId } : {}) };
  const employees = await employeesWithSchedules(empWhere);
  const statuses = await buildDayStatuses(employees, from, today, tz);

  // Today
  let presentToday = 0, lateToday = 0, onLeaveToday = 0, expectedToday = 0, checkedInNow = 0, pendingToday = 0;
  const todayRecords = await db.attendance.findMany({
    where: { workDate: dateOnly(today), employeeId: { in: employees.map((e) => e.id) } },
  });
  checkedInNow = todayRecords.filter((r) => !r.checkOutAt).length;
  const openNow = await db.attendance.count({
    where: { checkOutAt: null, employeeId: { in: employees.map((e) => e.id) } },
  });
  checkedInNow = Math.max(checkedInNow, openNow);

  for (const e of employees) {
    const s = statuses.get(e.id)?.get(today);
    if (!s) continue;
    const workDay = e.schedule.workDays.includes(isoWeekday(today));
    if (s.status === "ON_LEAVE") onLeaveToday++;
    if (s.record) {
      if (COUNTS_PRESENT.has(s.record.status)) presentToday++;
      if (s.record.isLate && s.record.status !== "REJECTED") lateToday++;
      if (s.record.status === "PENDING_VERIFICATION") pendingToday++;
    }
    if (workDay && s.status !== "NOT_JOINED") expectedToday++;
  }
  const absentToday = Math.max(0, expectedToday - presentToday - onLeaveToday);

  // Trend
  const trend = [] as { date: string; present: number; late: number; absent: number; onLeave: number; rate: number }[];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    let present = 0, late = 0, absent = 0, onLeave = 0, expected = 0;
    for (const e of employees) {
      const s = statuses.get(e.id)?.get(d);
      if (!s) continue;
      if (s.status === "ON_LEAVE") onLeave++;
      else if (s.status === "ABSENT") absent++;
      if (s.record && COUNTS_PRESENT.has(s.record.status)) {
        present++;
        if (s.record.isLate) late++;
      }
      if (e.schedule.workDays.includes(isoWeekday(d)) && s.status !== "NOT_JOINED") expected++;
    }
    if (d === today) absent = absentToday;
    trend.push({ date: d, present, late, absent, onLeave, rate: expected ? Math.round((present / expected) * 1000) / 10 : 0 });
  }

  // Period aggregates
  const periodRecords = await db.attendance.findMany({
    where: {
      workDate: { gte: dateOnly(from), lte: dateOnly(today) },
      employeeId: { in: employees.map((e) => e.id) },
      workedMinutes: { not: null },
      status: { not: "REJECTED" },
    },
    select: { workedMinutes: true },
  });
  const avgWorkedMinutes = periodRecords.length
    ? Math.round(periodRecords.reduce((s, r) => s + (r.workedMinutes ?? 0), 0) / periodRecords.length)
    : 0;
  const expectedTotal = trend.reduce((s, t) => s + t.present + t.absent, 0);
  const presentTotal = trend.reduce((s, t) => s + t.present, 0);

  // Department breakdown (today)
  const deptMap = new Map<string, { id: string; name: string; color: string; present: number; expected: number; late: number }>();
  for (const e of employees) {
    const key = e.department?.id ?? "none";
    const row = deptMap.get(key) ?? {
      id: key,
      name: e.department?.name ?? "Unassigned",
      color: e.department?.color ?? "#94a3b8",
      present: 0,
      expected: 0,
      late: 0,
    };
    const s = statuses.get(e.id)?.get(today);
    if (e.schedule.workDays.includes(isoWeekday(today)) && s?.status !== "NOT_JOINED" && s?.status !== "ON_LEAVE") row.expected++;
    if (s?.record && COUNTS_PRESENT.has(s.record.status)) {
      row.present++;
      if (s.record.isLate) row.late++;
    }
    deptMap.set(key, row);
  }

  const pendingVerification = await db.attendance.count({ where: { verificationStatus: "PENDING" } });
  const pendingLeaves = await db.leaveRequest.count({ where: { status: "PENDING" } });

  return {
    today,
    timezone: tz,
    metrics: {
      totalEmployees: employees.length,
      presentToday,
      absentToday,
      checkedInNow,
      onLeaveToday,
      lateToday,
      pendingToday,
      expectedToday,
      attendanceRateToday: expectedToday ? Math.round((presentToday / expectedToday) * 1000) / 10 : 0,
      attendanceRatePeriod: expectedTotal ? Math.round((presentTotal / expectedTotal) * 1000) / 10 : 0,
      avgWorkedMinutes,
      pendingVerification,
      pendingLeaves,
    },
    trend,
    departments: Array.from(deptMap.values()).sort((a, b) => b.expected - a.expected),
  };
}

export async function recentActivity(limit = 8) {
  const events = await db.attendanceEvidence.findMany({
    orderBy: { recordedAt: "desc" },
    take: limit * 2,
    include: {
      attendance: {
        select: {
          id: true,
          status: true,
          isLate: true,
          flags: true,
          employee: {
            select: { id: true, firstName: true, lastName: true, avatarKey: true, designation: true, department: { select: { name: true } } },
          },
        },
      },
    },
  });
  const map = async (type: "CHECK_IN" | "CHECK_OUT") =>
    Promise.all(
      events
        .filter((e) => e.type === type)
        .slice(0, limit)
        .map(async (e) => ({
          id: e.id,
          attendanceId: e.attendance.id,
          at: e.recordedAt.toISOString(),
          withinGeofence: e.withinGeofence,
          distanceMeters: e.distanceMeters,
          status: e.attendance.status,
          isLate: e.attendance.isLate,
          flags: e.attendance.flags,
          employee: {
            id: e.attendance.employee.id,
            name: `${e.attendance.employee.firstName} ${e.attendance.employee.lastName}`,
            designation: e.attendance.employee.designation,
            department: e.attendance.employee.department?.name ?? null,
            avatarUrl: await signedAvatar(e.attendance.employee.avatarKey),
          },
        })),
    );
  return { checkIns: await map("CHECK_IN"), checkOuts: await map("CHECK_OUT") };
}

/** Employee self analytics: month calendar + aggregates. */
export async function employeeSummary(employeeId: string, from: string, to: string) {
  const settings = await getSettings();
  const [emp] = await employeesWithSchedules({ id: employeeId });
  if (!emp) return null;
  const statuses = (await buildDayStatuses([emp], from, to, settings.timezone)).get(emp.id)!;
  let present = 0, late = 0, absent = 0, halfDay = 0, onLeave = 0, workedMinutes = 0, earlyDepartures = 0, workedDays = 0;
  const days = Array.from(statuses.entries()).map(([date, s]) => {
    if (s.status === "ABSENT") absent++;
    if (s.status === "ON_LEAVE") onLeave++;
    if (s.record) {
      if (COUNTS_PRESENT.has(s.record.status)) present++;
      if (s.record.isLate) late++;
      if (s.record.status === "HALF_DAY") halfDay++;
      if (s.record.isEarlyDeparture) earlyDepartures++;
      if (s.record.workedMinutes != null) {
        workedMinutes += s.record.workedMinutes;
        workedDays++;
      }
    }
    return {
      date,
      status: s.status,
      checkInAt: s.record?.checkInAt.toISOString() ?? null,
      checkOutAt: s.record?.checkOutAt?.toISOString() ?? null,
      workedMinutes: s.record?.workedMinutes ?? null,
      isLate: s.record?.isLate ?? false,
      lateMinutes: s.record?.lateMinutes ?? 0,
      isEarlyDeparture: s.record?.isEarlyDeparture ?? false,
      earlyMinutes: s.record?.earlyMinutes ?? 0,
    };
  });
  return {
    from,
    to,
    scheduledMinutesPerDay: scheduledMinutes(emp.schedule),
    totals: {
      present,
      late,
      absent,
      halfDay,
      onLeave,
      earlyDepartures,
      workedMinutes,
      avgWorkedMinutes: workedDays ? Math.round(workedMinutes / workedDays) : 0,
      attendanceRate: present + absent ? Math.round((present / (present + absent)) * 1000) / 10 : 0,
    },
    days,
  };
}

export { toYmd };
