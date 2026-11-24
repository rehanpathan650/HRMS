import { route } from "@/server/lib/api";
import { officeLocationSchema } from "@/lib/validators/org";
import { db } from "@/server/lib/db";
import { audit } from "@/server/lib/audit";
import { conflict } from "@/server/lib/errors";

export const PATCH = route({ auth: "ADMIN", body: officeLocationSchema.partial() }, async ({ user, params, body }) => {
  const before = await db.officeLocation.findUniqueOrThrow({ where: { id: params.id } });
  const o = await db.$transaction(async (tx) => {
    if (body.isDefault) await tx.officeLocation.updateMany({ where: { id: { not: params.id } }, data: { isDefault: false } });
    return tx.officeLocation.update({ where: { id: params.id }, data: body });
  });
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "office.update",
    entityType: "OfficeLocation",
    entityId: o.id,
    metadata: {
      before: { lat: before.latitude, lng: before.longitude, radius: before.radiusMeters },
      after: { lat: o.latitude, lng: o.longitude, radius: o.radiusMeters },
    },
  });
  return o;
});

export const DELETE = route({ auth: "ADMIN" }, async ({ user, params }) => {
  const o = await db.officeLocation.findUniqueOrThrow({ where: { id: params.id } });
  if (o.isDefault) throw conflict("The default office cannot be deleted. Set another office as default first.");
  await db.officeLocation.delete({ where: { id: params.id } });
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "office.delete",
    entityType: "OfficeLocation",
    entityId: o.id,
    metadata: { name: o.name },
  });
  return { ok: true };
});
