import { route } from "@/server/lib/api";
import { changePasswordSchema } from "@/lib/validators/auth";
import { db } from "@/server/lib/db";
import { hashPassword, verifyPassword } from "@/server/lib/password";
import { revokeAllSessions } from "@/server/lib/session";
import { audit } from "@/server/lib/audit";
import { ApiError } from "@/server/lib/errors";

export const POST = route(
  {
    auth: "ANY",
    body: changePasswordSchema,
    allowPasswordChangePending: true,
    rateLimit: { limit: 10, key: "auth:change" },
  },
  async ({ body, user }) => {
    const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(body.currentPassword, u.passwordHash))) {
      throw new ApiError(400, "INVALID_PASSWORD", "Current password is incorrect.");
    }
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.newPassword), mustChangePassword: false, passwordChangedAt: new Date() },
    });
    await revokeAllSessions(user.id, user.sessionId);
    await audit({ actorId: user.id, actorEmail: user.email, action: "auth.password_change", entityType: "User", entityId: user.id });
    return { ok: true };
  },
);
