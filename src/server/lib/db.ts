import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Pooled connections (Neon "-pooler", Supabase pooler, PgBouncer) run in transaction
 * mode, where Prisma must not reuse prepared statements. Add `pgbouncer=true` (and a
 * small per-instance connection limit for serverless) when the URL points at a pooler
 * and the options aren't already set.
 */
function datasourceUrl() {
  // Vercel's Neon integration may expose the URL under these names instead.
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const pooled = url.hostname.includes("-pooler") || url.port === "6543" || url.searchParams.has("pgbouncer");
    if (pooled) {
      if (!url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
      if (!url.searchParams.has("connection_limit") && process.env.VERCEL) url.searchParams.set("connection_limit", "5");
      if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "15");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: datasourceUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// Reuse one client per warm instance (dev hot reload and serverless invocations).
globalForPrisma.prisma = db;
