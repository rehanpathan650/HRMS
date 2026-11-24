import "server-only";
import { headers } from "next/headers";

export async function requestMeta() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip") || "unknown";
  return { ip: ip.slice(0, 64), userAgent: (h.get("user-agent") ?? "").slice(0, 256) };
}
