import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "./db";
import { env, isProd } from "./env";
import { randomToken, sha256 } from "./crypto";
import { SESSION_COOKIE } from "@/lib/constants";

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string }) {
  const token = randomToken(32);
  const ttlMs = env().SESSION_TTL_HOURS * 3600 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      expiresAt,
      ipAddress: meta.ip?.slice(0, 64),
      userAgent: meta.userAgent?.slice(0, 256),
    },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/", maxAge: 0 });
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/** Resolve the current session (memoized per request). Returns null if invalid. */
export const getSession = cache(async () => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 200) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
              avatarKey: true,
              designation: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) {
    return null;
  }
  if (session.user.employee && ["INACTIVE", "TERMINATED"].includes(session.user.employee.status)) {
    return null;
  }

  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }

  return { sessionId: session.id, ...session.user };
});

export async function revokeCurrentSession() {
  const s = await getSession();
  if (s) await db.session.update({ where: { id: s.sessionId }, data: { revokedAt: new Date() } });
  await clearSessionCookie();
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}
