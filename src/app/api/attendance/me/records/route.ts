import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { route } from "@/server/lib/api";
import { pagination, ymd } from "@/lib/validators/common";
import { db } from "@/server/lib/db";
import { dateOnly } from "@/server/lib/time";
import { serializeAttendance } from "@/server/services/attendance";

const query = pagination.extend({
  from: ymd.optional(),
  to: ymd.optional(),
  status: z
    .enum(["PRESENT", "LATE", "HALF_DAY", "PENDING_VERIFICATION", "REJECTED"])
    .optional(),
});

/** Paginated list of the current employee's own attendance records. */
export const GET = route({ auth: "EMPLOYEE", query }, async ({ user, query }) => {
  const where: Prisma.AttendanceWhereInput = {
    employeeId: user.employee!.id,
    ...(query.status ? { status: query.status } : {}),
    ...(query.from || query.to
      ? {
          workDate: {
            ...(query.from ? { gte: dateOnly(query.from) } : {}),
            ...(query.to ? { lte: dateOnly(query.to) } : {}),
          },
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    db.attendance.count({ where }),
    db.attendance.findMany({
      where,
      orderBy: { workDate: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        evidence: { select: { type: true, distanceMeters: true, withinGeofence: true, accuracyMeters: true } },
      },
    }),
  ]);
  return {
    items: rows.map((r) => ({
      ...serializeAttendance(r),
      evidence: r.evidence,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
});
