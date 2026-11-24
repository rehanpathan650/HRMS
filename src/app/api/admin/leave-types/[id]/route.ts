import { route } from "@/server/lib/api";
import { leaveTypeSchema } from "@/lib/validators/leave";
import { db } from "@/server/lib/db";
import { audit } from "@/server/lib/audit";

export const PATCH = route({ auth: "ADMIN", body: leaveTypeSchema.partial() }, async ({ user, params, body }) => {
  const t = await db.leaveType.update({ where: { id: params.id }, data: body });
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "leave_type.update",
    entityType: "LeaveType",
    entityId: t.id,
    metadata: { changed: Object.keys(body) },
  });
  return t;
});
