import "server-only";
import { db } from "../lib/db";
import { storage } from "../lib/storage";
import { getSettings } from "./settings";

/**
 * Applies the configured retention policy:
 *  - Selfie images older than `selfieRetentionDays` are deleted from storage and
 *    marked purged (metadata + hash are kept as evidence that a selfie existed).
 *  - Unused selfie uploads older than 1 day are removed entirely.
 *  - Expired sessions, reset tokens and idempotency keys are cleaned up.
 *  - Audit entries older than `auditRetentionDays` are purged via the explicit
 *    opt-in the append-only trigger allows.
 */
export async function runRetention() {
  const settings = await getSettings();
  const now = Date.now();
  const selfieCutoff = new Date(now - settings.selfieRetentionDays * 86_400_000);
  const orphanCutoff = new Date(now - 86_400_000);

  let purgedSelfies = 0;
  const old = await db.selfieUpload.findMany({
    where: { purgedAt: null, createdAt: { lt: selfieCutoff } },
    select: { id: true, storageKey: true },
    take: 5000,
  });
  for (const s of old) {
    await storage().delete(s.storageKey).catch(() => {});
    await db.selfieUpload.update({ where: { id: s.id }, data: { purgedAt: new Date() } });
    purgedSelfies++;
  }

  const orphans = await db.selfieUpload.findMany({
    where: { consumedAt: null, createdAt: { lt: orphanCutoff } },
    select: { id: true, storageKey: true },
    take: 5000,
  });
  for (const o of orphans) {
    await storage().delete(o.storageKey).catch(() => {});
  }
  await db.selfieUpload.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });

  const [sessions, tokens, keys] = await Promise.all([
    db.session.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: orphanCutoff } }] } }),
    db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: orphanCutoff } } }),
    db.idempotencyKey.deleteMany({ where: { createdAt: { lt: orphanCutoff } } }),
  ]);

  const auditCutoff = new Date(now - settings.auditRetentionDays * 86_400_000);
  const purgedAudit = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL attendly.audit_purge = 'on'`);
    return tx.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } });
  });

  return {
    purgedSelfies,
    removedOrphanUploads: orphans.length,
    removedSessions: sessions.count,
    removedResetTokens: tokens.count,
    removedIdempotencyKeys: keys.count,
    purgedAuditEntries: purgedAudit.count,
  };
}
