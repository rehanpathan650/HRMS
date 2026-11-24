import { route } from "@/server/lib/api";
import { loginSchema } from "@/lib/validators/auth";
import { db } from "@/server/lib/db";
import { fakeVerify, verifyPassword } from "@/server/lib/password";
import { createSession } from "@/server/lib/session";
import { audit } from "@/server/lib/audit";
import { ApiError } from "@/server/lib/errors";
import { rateLimit } from "@/server/lib/rate-limit";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const invalid = () => new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");

export const POST = route(
  { auth: "PUBLIC", body: loginSchema, rateLimit: { limit: 10, key: "auth:login" } },
  async ({ body, ip, userAgent }) => {
    // Per-account throttle in addition to per-IP.
    const acct = await rateLimit(`login-acct:${body.email}`, 10, 300);
    if (!acct.allowed) throw new ApiError(429, "RATE_LIMITED", "Too many attempts. Try again in a few minutes.");

    const user = await db.user.findUnique({ where: { email: body.email } });
    if (!user) {
      await fakeVerify(body.password);
      throw invalid();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ApiError(423, "ACCOUNT_LOCKED", "Account temporarily locked after failed attempts. Try again later.");
    }
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      const attempts = user.failedLoginAttempts + 1;
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts >= MAX_ATTEMPTS ? 0 : attempts,
          lockedUntil: attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
        },
      });
      await audit({ actorId: user.id, actorEmail: user.email, action: "auth.login_failed", entityType: "User", entityId: user.id });
      throw invalid();
    }
    if (!user.isActive) throw new ApiError(403, "ACCOUNT_DISABLED", "Your account is disabled. Contact your administrator.");

    await db.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await createSession(user.id, { ip, userAgent });
    await audit({ actorId: user.id, actorEmail: user.email, action: "auth.login", entityType: "User", entityId: user.id });
    return { role: user.role, mustChangePassword: user.mustChangePassword };
  },
);
