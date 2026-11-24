import { route } from "@/server/lib/api";
import { systemSettingsSchema } from "@/lib/validators/org";
import { db } from "@/server/lib/db";
import { audit } from "@/server/lib/audit";
import { badRequest } from "@/server/lib/errors";
import { isValidTimeZone } from "@/server/lib/time";
import { getSettings } from "@/server/services/settings";

export const GET = route({ auth: "ADMIN" }, async () => getSettings());

export const PUT = route({ auth: "ADMIN", body: systemSettingsSchema }, async ({ user, body }) => {
  if (!isValidTimeZone(body.timezone)) throw badRequest("Unknown timezone");
  const before = await getSettings();
  const s = await db.systemSetting.update({ where: { id: "default" }, data: body });
  const changed = Object.fromEntries(
    Object.entries(body)
      .filter(([k, v]) => (before as Record<string, unknown>)[k] !== v)
      .map(([k, v]) => [k, { from: (before as Record<string, unknown>)[k], to: v }]),
  );
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "settings.update",
    entityType: "SystemSetting",
    entityId: "default",
    metadata: JSON.parse(JSON.stringify(changed)),
  });
  return s;
});
