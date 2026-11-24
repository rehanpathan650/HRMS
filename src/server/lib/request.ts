import "server-only";
import { headers } from "next/headers";

/**
 * Client IP and user agent for audit logs and rate limiting.
 *
 * Next.js fills X-Forwarded-For with the socket address only when the client did
 * not send one, so without a trusted reverse proxy the value is client-controlled.
 *  - TRUST_PROXY=true  → use the right-most entry (appended by our own proxy).
 *  - otherwise         → use the first entry as a best-effort key. Login abuse is
 *    still bounded by per-account limits, lockout and a global ceiling, none of
 *    which depend on the IP.
 */
export async function requestMeta() {
  const h = await headers();
  const chain = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const ip =
    (process.env.TRUST_PROXY === "true" ? chain[chain.length - 1] : chain[0]) || h.get("x-real-ip") || "unknown";
  return { ip: ip.slice(0, 64), userAgent: (h.get("user-agent") ?? "").slice(0, 256) };
}
