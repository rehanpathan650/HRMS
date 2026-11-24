import { route } from "@/server/lib/api";
import { departmentSchema } from "@/lib/validators/org";
import { db } from "@/server/lib/db";
import { audit } from "@/server/lib/audit";

export const PATCH = route({ auth: "ADMIN", body: departmentSchema.partial() }, async ({ user, params, body }) => {
  const d = await db.department.update({ where: { id: params.id }, data: body });
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "department.update",
    entityType: "Department",
    entityId: d.id,
    metadata: { changed: Object.keys(body) },
  });
  return d;
});

/** Members are unassigned (FK set null), not deleted. */
export const DELETE = route({ auth: "ADMIN" }, async ({ user, params }) => {
  const d = await db.department.delete({ where: { id: params.id } });
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "department.delete",
    entityType: "Department",
    entityId: d.id,
    metadata: { name: d.name },
  });
  return { ok: true };
});
