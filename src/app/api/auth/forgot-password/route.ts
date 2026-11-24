import { route } from "@/server/lib/api";
import { forgotPasswordSchema } from "@/lib/validators/auth";
import { db } from "@/server/lib/db";
import { randomToken, sha256 } from "@/server/lib/crypto";
import { env } from "@/server/lib/env";
import { audit } from "@/server/lib/audit";

const TOKEN_TTL_MINUTES = 30;

export const POST = route(
  { auth: "PUBLIC", body: forgotPasswordSchema, rateLimit: { limit: 5, key: "auth:forgot" } },
  async ({ body }) => {
    const user = await db.user.findUnique({ where: { email: body.email } });
    let devLink: string | undefined;
    if (user && user.isActive) {
      await db.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      const token = randomToken(32);
      await db.passwordResetToken.create({
        data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000) },
      });
      const link = `${env().APP_URL}/reset-password?token=${token}`;
      // No email provider is bundled. Plug SMTP/SES in here; until then the link is logged server-side.
      console.info(`[password-reset] Reset link for ${user.email}: ${link}`);
      if (env().NODE_ENV !== "production" && env().DEV_EXPOSE_RESET_LINK) devLink = link;
      await audit({
        actorId: user.id,
        actorEmail: user.email,
        action: "auth.password_reset_requested",
        entityType: "User",
        entityId: user.id,
      });
    }
    // Identical response whether or not the account exists (prevents account enumeration).
    return {
      message: "If an account exists for that email, a reset link has been sent.",
      ...(devLink ? { devResetLink: devLink } : {}),
    };
  },
);
