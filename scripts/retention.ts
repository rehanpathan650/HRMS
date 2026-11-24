/**
 * Applies the data-retention policy (expired selfies, old audit entries,
 * stale sessions/tokens). Schedule daily, e.g. cron: `0 3 * * * npm run retention`.
 *
 * Runs the same logic as Admin → Settings → System → "Apply retention policy",
 * but without the Next.js runtime, so it re-implements the small pieces it needs.
 */
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";

const db = new PrismaClient();

async function main() {
  if ((process.env.STORAGE_DRIVER ?? "local") !== "local") {
    console.error("scripts/retention.ts handles local storage only. With S3, use the admin UI action or an S3 lifecycle rule.");
    process.exit(1);
  }
  const root = path.resolve(process.env.STORAGE_LOCAL_DIR ?? "./storage");
  const settings = await db.systemSetting.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  const now = Date.now();
  const selfieCutoff = new Date(now - settings.selfieRetentionDays * 86_400_000);
  const dayAgo = new Date(now - 86_400_000);

  const old = await db.selfieUpload.findMany({ where: { purgedAt: null, createdAt: { lt: selfieCutoff } } });
  for (const s of old) {
    await fs.rm(path.join(root, s.storageKey), { force: true });
    await db.selfieUpload.update({ where: { id: s.id }, data: { purgedAt: new Date() } });
  }
  const orphans = await db.selfieUpload.findMany({ where: { consumedAt: null, createdAt: { lt: dayAgo } } });
  for (const o of orphans) await fs.rm(path.join(root, o.storageKey), { force: true });
  await db.selfieUpload.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });

  await db.session.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: dayAgo } }] } });
  await db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: dayAgo } } });
  await db.idempotencyKey.deleteMany({ where: { createdAt: { lt: dayAgo } } });

  const auditCutoff = new Date(now - settings.auditRetentionDays * 86_400_000);
  const purged = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL attendly.audit_purge = 'on'`);
    return tx.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } });
  });
  await db.auditLog.create({
    data: { action: "retention.run", entityType: "System", metadata: { purgedSelfies: old.length, orphans: orphans.length, purgedAudit: purged.count } },
  });
  console.log(`Retention done: ${old.length} selfies purged, ${orphans.length} orphan uploads removed, ${purged.count} audit entries purged.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
