import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { route } from "@/server/lib/api";
import { pagination, ymd } from "@/lib/validators/common";
import { db } from "@/server/lib/db";
import { dateOnly } from "@/server/lib/time";
import { serializeAttendance } from "@/server/services/attendance";
import { signedAvatar } from "@/server/services/employees";

const query = pagination.extend({
  from: ymd.optional(),
  to: ymd.optional(),
  departmentId: z.string().max(40).optional(),
  employeeId: z.string().max(40).optional(),
  status: z.enum(["PRESENT", "LATE", "HALF_DAY", "PENDING_VERIFICATION", "REJECTED"]).optional(),
  verification: z.enum(["AUTO_APPROVED", "PENDING", "APPROVED", "REJECTED"]).optional(),
  flagged: z.enum(["true", "false"]).optional(),
  open: z.enum(["true", "false"]).optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(["workDate", "checkInAt", "workedMinutes", "riskScore", "lateMinutes"]).default("checkInAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const GET = route({ auth: "ADMIN", query }, async ({ query: q }) => {
  const employee: Prisma.EmployeeWhereInput = {};
  if (q.departmentId) employee.departmentId = q.departmentId;
  if (q.search) {
    employee.OR = [
      { firstName: { contains: q.search, mode: "insensitive" } },
      { lastName: { contains: q.search, mode: "insensitive" } },
      { employeeCode: { contains: q.search, mode: "insensitive" } },
    ];
  }
  const where: Prisma.AttendanceWhereInput = {
    employee,
    ...(q.employeeId ? { employeeId: q.employeeId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.verification ? { verificationStatus: q.verification } : {}),
    ...(q.flagged === "true" ? { NOT: { flags: { isEmpty: true } } } : {}),
    ...(q.open === "true" ? { checkOutAt: null } : {}),
    ...(q.from || q.to
      ? {
          workDate: {
            ...(q.from ? { gte: dateOnly(q.from) } : {}),
            ...(q.to ? { lte: dateOnly(q.to) } : {}),
          },
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    db.attendance.count({ where }),
    db.attendance.findMany({
      where,
      orderBy: [{ [q.sort]: q.order }, { id: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            avatarKey: true,
            designation: true,
            department: { select: { name: true, color: true } },
          },
        },
        evidence: { select: { type: true, distanceMeters: true, withinGeofence: true, accuracyMeters: true } },
      },
    }),
  ]);
  return {
    items: await Promise.all(
      rows.map(async (r) => ({
        ...serializeAttendance(r),
        evidence: r.evidence,
        employee: {
          id: r.employee.id,
          name: `${r.employee.firstName} ${r.employee.lastName}`,
          employeeCode: r.employee.employeeCode,
          designation: r.employee.designation,
          department: r.employee.department,
          avatarUrl: await signedAvatar(r.employee.avatarKey),
        },
      })),
    ),
    total,
    page: q.page,
    pageSize: q.pageSize,
    pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
  };
});
