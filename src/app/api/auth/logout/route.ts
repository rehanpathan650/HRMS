import { route } from "@/server/lib/api";
import { revokeCurrentSession } from "@/server/lib/session";
import { audit } from "@/server/lib/audit";

export const POST = route({ auth: "PUBLIC" }, async ({ user }) => {
  if (user) {
    await audit({ actorId: user.id, actorEmail: user.email, action: "auth.logout", entityType: "User", entityId: user.id });
  }
  await revokeCurrentSession();
  return { ok: true };
});
