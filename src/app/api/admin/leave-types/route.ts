import { route } from "@/server/lib/api";
import { leaveTypeSchema } from "@/lib/validators/leave";
import { db } from "@/server/lib/db";
import { audit } from "@/server/lib/audit";

export const GET = route({ auth: "ADMIN" }, async () => {
  const types = await db.leaveType.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { requests: true } } },
  });
  return types.map((t) => ({ ...t, requestCount: t._count.requests }));
});

export const POST = route({ auth: "ADMIN", body: leaveTypeSchema }, async ({ user, body }) => {
  const t = await db.leaveType.create({ data: body });
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "leave_type.create",
    entityType: "LeaveType",
    entityId: t.id,
    metadata: { code: t.code },
  });
  return t;
});
