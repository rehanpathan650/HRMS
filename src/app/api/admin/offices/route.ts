import { route } from "@/server/lib/api";
import { officeLocationSchema } from "@/lib/validators/org";
import { db } from "@/server/lib/db";
import { audit } from "@/server/lib/audit";

export const GET = route({ auth: "ADMIN" }, async () => {
  const list = await db.officeLocation.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { _count: { select: { employees: true } } },
  });
  return list.map(({ _count, ...o }) => ({ ...o, employeeCount: _count.employees }));
});

export const POST = route({ auth: "ADMIN", body: officeLocationSchema }, async ({ user, body }) => {
  const o = await db.$transaction(async (tx) => {
    if (body.isDefault) await tx.officeLocation.updateMany({ data: { isDefault: false } });
    return tx.officeLocation.create({ data: body });
  });
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "office.create",
    entityType: "OfficeLocation",
    entityId: o.id,
    metadata: { name: o.name, radiusMeters: o.radiusMeters },
  });
  return o;
});
