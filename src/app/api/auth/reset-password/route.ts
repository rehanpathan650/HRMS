import { route } from "@/server/lib/api";
import { resetPasswordSchema } from "@/lib/validators/auth";
import { db } from "@/server/lib/db";
import { sha256 } from "@/server/lib/crypto";
import { hashPassword } from "@/server/lib/password";
import { revokeAllSessions } from "@/server/lib/session";
import { audit } from "@/server/lib/audit";
import { badRequest } from "@/server/lib/errors";

export const POST = route(
  { auth: "PUBLIC", body: resetPasswordSchema, rateLimit: { limit: 10, key: "auth:reset" } },
  async ({ body }) => {
    const record = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(body.token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw badRequest("This reset link is invalid or has expired. Request a new one.");
    }
    const passwordHash = await hashPassword(body.password);
    await db.$transaction([
      db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      db.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
    ]);
    await revokeAllSessions(record.userId);
    await audit({ actorId: record.userId, action: "auth.password_reset", entityType: "User", entityId: record.userId });
    return { ok: true };
  },
);
