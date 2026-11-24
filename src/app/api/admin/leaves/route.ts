import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { route } from "@/server/lib/api";
import { pagination } from "@/lib/validators/common";
import { db } from "@/server/lib/db";
import { serializeLeave } from "@/server/services/leave";

const query = pagination.extend({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  leaveTypeId: z.string().max(40).optional(),
  departmentId: z.string().max(40).optional(),
  search: z.string().trim().max(100).optional(),
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
  const where: Prisma.LeaveRequestWhereInput = {
    employee,
    ...(q.status ? { status: q.status } : {}),
    ...(q.leaveTypeId ? { leaveTypeId: q.leaveTypeId } : {}),
  };
  const [total, rows, counts] = await Promise.all([
    db.leaveRequest.count({ where }),
    db.leaveRequest.findMany({
      where,
      include: {
        leaveType: true,
        reviewer: { select: { email: true } },
        employee: { include: { department: { select: { name: true } } } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    db.leaveRequest.groupBy({ by: ["status"], _count: true }),
  ]);
  return {
    items: rows.map(serializeLeave),
    total,
    page: q.page,
    pageSize: q.pageSize,
    pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
  };
});
