import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { audit } from "../lib/audit";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { hashPassword } from "../lib/password";
import { randomToken } from "../lib/crypto";
import { revokeAllSessions, type SessionUser } from "../lib/session";
import { storage } from "../lib/storage";
import { dateOnly, toYmd } from "../lib/time";
import type { CreateEmployeeInput } from "@/lib/validators/employee";
import { ensureBalances } from "./leave";

export async function signedAvatar(key: string | null | undefined) {
  if (!key) return null;
  try {
    return await storage().signedUrl(key, 3600);
  } catch {
    return null;
  }
}

export const employeeListInclude = {
  user: { select: { email: true, role: true, isActive: true, lastLoginAt: true } },
  department: { select: { id: true, name: true, color: true } },
  manager: { select: { id: true, firstName: true, lastName: true } },
  workSchedule: { select: { id: true, name: true } },
  officeLocation: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeInclude;

type EmployeeWithRelations = Prisma.EmployeeGetPayload<{ include: typeof employeeListInclude }>;

export async function serializeEmployee(e: EmployeeWithRelations) {
  return {
    id: e.id,
    employeeCode: e.employeeCode,
    firstName: e.firstName,
    lastName: e.lastName,
    name: `${e.firstName} ${e.lastName}`,
    email: e.user.email,
    role: e.user.role,
    isActive: e.user.isActive,
    lastLoginAt: e.user.lastLoginAt?.toISOString() ?? null,
    phone: e.phone,
    avatarUrl: await signedAvatar(e.avatarKey),
    designation: e.designation,
    joiningDate: toYmd(e.joiningDate),
    dateOfBirth: e.dateOfBirth ? toYmd(e.dateOfBirth) : null,
    address: e.address,
    emergencyContact: e.emergencyContact,
    status: e.status,
    allowRemote: e.allowRemote,
    department: e.department,
    manager: e.manager ? { id: e.manager.id, name: `${e.manager.firstName} ${e.manager.lastName}` } : null,
    workSchedule: e.workSchedule,
    officeLocation: e.officeLocation,
    createdAt: e.createdAt.toISOString(),
  };
}

export interface EmployeeListQuery {
  page: number;
  pageSize: number;
  search?: string;
  departmentId?: string;
  status?: string;
  sort?: string;
  order?: "asc" | "desc";
}

export async function listEmployees(q: EmployeeListQuery) {
  const where: Prisma.EmployeeWhereInput = {};
  if (q.search) {
    const s = q.search.trim();
    where.OR = [
      { firstName: { contains: s, mode: "insensitive" } },
      { lastName: { contains: s, mode: "insensitive" } },
      { employeeCode: { contains: s, mode: "insensitive" } },
      { designation: { contains: s, mode: "insensitive" } },
      { user: { email: { contains: s, mode: "insensitive" } } },
    ];
  }
  if (q.departmentId) where.departmentId = q.departmentId;
  if (q.status) where.status = q.status as Prisma.EmployeeWhereInput["status"];

  const dir = q.order ?? "asc";
  const orderBy: Prisma.EmployeeOrderByWithRelationInput[] =
    q.sort === "joiningDate"
      ? [{ joiningDate: dir }]
      : q.sort === "employeeCode"
        ? [{ employeeCode: dir }]
        : q.sort === "department"
          ? [{ department: { name: dir } }, { firstName: "asc" }]
          : q.sort === "designation"
            ? [{ designation: dir }]
            : [{ firstName: dir }, { lastName: dir }];

  const [total, rows] = await Promise.all([
    db.employee.count({ where }),
    db.employee.findMany({
      where,
      include: employeeListInclude,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return {
    items: await Promise.all(rows.map(serializeEmployee)),
    total,
    page: q.page,
    pageSize: q.pageSize,
    pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export async function getEmployee(id: string) {
  const e = await db.employee.findUnique({ where: { id }, include: employeeListInclude });
  if (!e) throw notFound("Employee not found");
  return serializeEmployee(e);
}

async function assertRefs(input: Partial<CreateEmployeeInput>, selfId?: string) {
  const checks: Promise<unknown>[] = [];
  if (input.departmentId)
    checks.push(db.department.findUniqueOrThrow({ where: { id: input.departmentId } }).catch(() => {
      throw badRequest("Department not found");
    }));
  if (input.workScheduleId)
    checks.push(db.workSchedule.findUniqueOrThrow({ where: { id: input.workScheduleId } }).catch(() => {
      throw badRequest("Work schedule not found");
    }));
  if (input.officeLocationId)
    checks.push(db.officeLocation.findUniqueOrThrow({ where: { id: input.officeLocationId } }).catch(() => {
      throw badRequest("Office location not found");
    }));
  await Promise.all(checks);

  if (input.managerId) {
    if (input.managerId === selfId) throw badRequest("An employee cannot report to themselves.");
    // Walk up the chain to prevent reporting cycles.
    let cursor: string | null = input.managerId;
    for (let i = 0; cursor && i < 50; i++) {
      const m: { id: string; managerId: string | null } | null = await db.employee.findUnique({
        where: { id: cursor },
        select: { id: true, managerId: true },
      });
      if (!m) throw badRequest("Reporting manager not found");
      if (selfId && m.managerId === selfId) throw badRequest("This would create a reporting cycle.");
      cursor = m.managerId;
    }
  }
}

/** Creates the user + employee. Returns a one-time temporary password for the admin to share. */
export async function createEmployee(admin: SessionUser, input: CreateEmployeeInput) {
  await assertRefs(input);
  const tempPassword = `Tmp-${randomToken(9)}!7a`;
  const passwordHash = await hashPassword(tempPassword);

  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: input.role,
        mustChangePassword: true,
        isActive: !["INACTIVE", "TERMINATED"].includes(input.status),
        employee: {
          create: {
            employeeCode: input.employeeCode,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            designation: input.designation,
            joiningDate: dateOnly(input.joiningDate),
            departmentId: input.departmentId,
            managerId: input.managerId,
            workScheduleId: input.workScheduleId,
            officeLocationId: input.officeLocationId,
            status: input.status,
            allowRemote: input.allowRemote,
          },
        },
      },
      include: { employee: true },
    });
    await audit(
      {
        actorId: admin.id,
        actorEmail: admin.email,
        action: "employee.create",
        entityType: "Employee",
        entityId: user.employee!.id,
        metadata: { email: input.email, role: input.role, employeeCode: input.employeeCode },
      },
      tx,
    );
    return user.employee!;
  });
  await ensureBalances(created.id, new Date().getUTCFullYear());
  return { employee: await getEmployee(created.id), temporaryPassword: tempPassword };
}

export async function updateEmployee(admin: SessionUser, id: string, input: Partial<CreateEmployeeInput>) {
  const existing = await db.employee.findUnique({ where: { id }, include: { user: true } });
  if (!existing) throw notFound("Employee not found");
  await assertRefs(input, id);

  const isSelf = existing.userId === admin.id;
  if (isSelf && input.role && input.role !== "ADMIN") throw forbidden("You cannot remove your own admin role.");
  if (isSelf && input.status && ["INACTIVE", "TERMINATED"].includes(input.status))
    throw forbidden("You cannot deactivate your own account.");
  if (input.role === "EMPLOYEE" && existing.user.role === "ADMIN") {
    const admins = await db.user.count({ where: { role: "ADMIN", isActive: true } });
    if (admins <= 1) throw conflict("At least one active admin is required.");
  }

  const deactivating = input.status && ["INACTIVE", "TERMINATED"].includes(input.status);
  const reactivating = input.status && !["INACTIVE", "TERMINATED"].includes(input.status);

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.userId },
      data: {
        ...(input.email ? { email: input.email } : {}),
        ...(input.role ? { role: input.role } : {}),
        ...(deactivating ? { isActive: false } : reactivating ? { isActive: true } : {}),
      },
    });
    await tx.employee.update({
      where: { id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone === undefined ? undefined : input.phone,
        employeeCode: input.employeeCode,
        designation: input.designation,
        joiningDate: input.joiningDate ? dateOnly(input.joiningDate) : undefined,
        departmentId: input.departmentId === undefined ? undefined : input.departmentId,
        managerId: input.managerId === undefined ? undefined : input.managerId,
        workScheduleId: input.workScheduleId === undefined ? undefined : input.workScheduleId,
        officeLocationId: input.officeLocationId === undefined ? undefined : input.officeLocationId,
        status: input.status,
        allowRemote: input.allowRemote,
      },
    });
    const changed = Object.keys(input).filter(
      (k) => (input as Record<string, unknown>)[k] !== undefined,
    );
    await audit(
      {
        actorId: admin.id,
        actorEmail: admin.email,
        action: deactivating ? "employee.deactivate" : "employee.update",
        entityType: "Employee",
        entityId: id,
        metadata: { changed },
      },
      tx,
    );
  });
  const roleChanged = !!input.role && input.role !== existing.user.role;
  const wasActive = existing.user.isActive;
  if ((deactivating && wasActive) || roleChanged) await revokeAllSessions(existing.userId);
  return getEmployee(id);
}

export async function deleteEmployee(admin: SessionUser, id: string) {
  const e = await db.employee.findUnique({ where: { id }, include: { _count: { select: { attendances: true } } } });
  if (!e) throw notFound("Employee not found");
  if (e.userId === admin.id) throw forbidden("You cannot delete your own account.");
  if (e._count.attendances > 0) {
    throw conflict(
      "This employee has attendance history. Deactivate the account instead to preserve records.",
    );
  }
  await db.$transaction(async (tx) => {
    await audit(
      {
        actorId: admin.id,
        actorEmail: admin.email,
        action: "employee.delete",
        entityType: "Employee",
        entityId: id,
        metadata: { employeeCode: e.employeeCode, name: `${e.firstName} ${e.lastName}` },
      },
      tx,
    );
    await tx.user.delete({ where: { id: e.userId } });
  });
}

export async function resetEmployeePassword(admin: SessionUser, id: string) {
  const e = await db.employee.findUnique({ where: { id } });
  if (!e) throw notFound("Employee not found");
  const tempPassword = `Tmp-${randomToken(9)}!7a`;
  await db.user.update({
    where: { id: e.userId },
    data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null },
  });
  await revokeAllSessions(e.userId);
  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "employee.password_reset",
    entityType: "Employee",
    entityId: id,
  });
  return { temporaryPassword: tempPassword };
}
