import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "./db";
import { requestMeta } from "./request";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface AuditEntry {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/** Append an audit record. Pass `tx` to make it part of the same transaction as the change. */
export async function audit(entry: AuditEntry, tx: Tx = db) {
  const meta = await requestMeta().catch(() => ({ ip: undefined, userAgent: undefined }));
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    },
  });
}
