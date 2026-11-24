import { z } from "zod";
import { route, withIdempotency } from "@/server/lib/api";
import { applyLeaveSchema } from "@/lib/validators/leave";
import { pagination } from "@/lib/validators/common";
import { db } from "@/server/lib/db";
import { applyLeave, serializeLeave } from "@/server/services/leave";

const query = pagination.extend({ status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional() });

/** Own leave requests. */
export const GET = route({ auth: "EMPLOYEE", query }, async ({ user, query }) => {
  const where = { employeeId: user.employee!.id, ...(query.status ? { status: query.status } : {}) };
  const [total, rows] = await Promise.all([
    db.leaveRequest.count({ where }),
    db.leaveRequest.findMany({
      where,
      include: { leaveType: true, reviewer: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return {
    items: rows.map(serializeLeave),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
});

export const POST = route(
  { auth: "EMPLOYEE", body: applyLeaveSchema, rateLimit: { limit: 10, key: "leaves:apply" } },
  async ({ req, user, body }) =>
    withIdempotency(user.id, "leaves.apply", req.headers.get("idempotency-key"), async () =>
      serializeLeave(await applyLeave(user, body)),
    ),
);
