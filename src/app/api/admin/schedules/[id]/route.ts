import { route } from "@/server/lib/api";
import { workScheduleSchema } from "@/lib/validators/org";
import { db } from "@/server/lib/db";
import { audit } from "@/server/lib/audit";
import { conflict } from "@/server/lib/errors";
import { scheduleData, serializeSchedule } from "../shared";

export const PATCH = route({ auth: "ADMIN", body: workScheduleSchema.partial() }, async ({ user, params, body }) => {
  const s = await db.$transaction(async (tx) => {
    if (body.isDefault) await tx.workSchedule.updateMany({ where: { id: { not: params.id } }, data: { isDefault: false } });
    return tx.workSchedule.update({ where: { id: params.id }, data: scheduleData(body) });
  });
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "schedule.update",
    entityType: "WorkSchedule",
    entityId: s.id,
    metadata: { changed: Object.keys(body) },
  });
  return serializeSchedule(s);
});

export const DELETE = route({ auth: "ADMIN" }, async ({ user, params }) => {
  const s = await db.workSchedule.findUniqueOrThrow({ where: { id: params.id } });
  if (s.isDefault) throw conflict("The default schedule cannot be deleted. Make another schedule the default first.");
  await db.workSchedule.delete({ where: { id: params.id } });
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "schedule.delete",
    entityType: "WorkSchedule",
    entityId: s.id,
    metadata: { name: s.name },
  });
  return { ok: true };
});
