import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/server/lib/db";
import { runRetention } from "@/server/services/retention";

/**
 * Daily data-retention job, triggered by Vercel Cron (see vercel.json).
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`; anything else gets 401.
 * Disabled entirely when CRON_SECRET is not configured.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  try {
    const result = await runRetention();
    await db.auditLog.create({
      data: { actorEmail: "cron", action: "retention.run", entityType: "System", metadata: result },
    });
    return NextResponse.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron] retention failed", e);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}
