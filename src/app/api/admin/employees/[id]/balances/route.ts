import { z } from "zod";
import { route } from "@/server/lib/api";
import { db } from "@/server/lib/db";
import { audit } from "@/server/lib/audit";
import { id } from "@/lib/validators/common";
import { getBalances } from "@/server/services/leave";

const body = z.object({
  leaveTypeId: id,
  year: z.number().int().min(2000).max(2100),
  allocated: z.number().min(0).max(365),
});

/** Admin override of an employee's yearly allocation for a leave type. */
export const PUT = route({ auth: "ADMIN", body }, async ({ user, params, body }) => {
  await db.employee.findUniqueOrThrow({ where: { id: params.id } });
  const res = await db.leaveBalance.upsert({
    where: { employeeId_leaveTypeId_year: { employeeId: params.id, leaveTypeId: body.leaveTypeId, year: body.year } },
    update: { allocated: body.allocated },
    create: { employeeId: params.id, leaveTypeId: body.leaveTypeId, year: body.year, allocated: body.allocated },
  });
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "leave.balance_update",
    entityType: "LeaveBalance",
    entityId: res.id,
    metadata: body,
  });
  return getBalances(params.id, body.year);
});
