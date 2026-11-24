import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/lib/session";
import { storage, verifyLocalSignature, sniffImageType } from "@/server/lib/storage";
import { db } from "@/server/lib/db";

/**
 * Serves private files from local storage. Requires BOTH a valid, unexpired
 * HMAC signature AND an authorized session:
 *  - selfies/<employeeId>/…  → admins, or the employee who owns them
 *  - avatars/…              → any signed-in user
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const key = parts.map(decodeURIComponent).join("/");
  const deny = (status = 404) => new NextResponse(null, { status });

  if (!verifyLocalSignature(key, req.nextUrl.searchParams.get("exp"), req.nextUrl.searchParams.get("sig"))) {
    return deny(403);
  }
  const user = await getSession();
  if (!user) return deny(401);

  if (key.startsWith("selfies/")) {
    const ownerId = key.split("/")[1];
    if (user.role !== "ADMIN" && user.employee?.id !== ownerId) return deny(403);
    const upload = await db.selfieUpload.findUnique({ where: { storageKey: key }, select: { purgedAt: true } });
    if (!upload || upload.purgedAt) return deny(404);
  } else if (!key.startsWith("avatars/")) {
    return deny(404);
  }

  const data = await storage().get(key);
  if (!data) return deny(404);
  const type = sniffImageType(data) ?? "application/octet-stream";
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Disposition": "inline",
    },
  });
}
