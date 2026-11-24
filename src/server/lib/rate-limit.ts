import "server-only";
import Redis from "ioredis";
import { env } from "./env";

type Result = { allowed: boolean; remaining: number; resetSeconds: number };

let redis: Redis | null | undefined;
function getRedis() {
  if (redis !== undefined) return redis;
  // KV_URL is the name Vercel's Upstash integration uses for the rediss:// URL.
  const url = env().REDIS_URL || process.env.KV_URL || undefined;
  if (!url) return (redis = null);
  redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
  redis.on("error", () => {
    /* fall back to memory silently; logged once below */
  });
  return redis;
}

function waitForReady(r: Redis, ms: number) {
  if (r.status === "ready" || r.status === "end") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      r.off("ready", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    r.once("ready", done);
  });
}

const memory = new Map<string, { count: number; reset: number }>();

function memoryLimit(key: string, limit: number, windowSec: number): Result {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.reset <= now) {
    memory.set(key, { count: 1, reset: now + windowSec * 1000 });
    if (memory.size > 50_000) {
      for (const [k, v] of memory) if (v.reset <= now) memory.delete(k);
    }
    return { allowed: true, remaining: limit - 1, resetSeconds: windowSec };
  }
  entry.count++;
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetSeconds: Math.ceil((entry.reset - now) / 1000),
  };
}

/** Fixed-window rate limiter. Uses Redis when available, in-process memory otherwise. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<Result> {
  const r = getRedis();
  // Serverless cold starts: wait briefly for the connection instead of silently
  // falling back to per-instance memory (which would weaken limits).
  if (r && r.status !== "ready") await waitForReady(r, 1500);
  if (r && r.status === "ready") {
    try {
      const k = `rl:${key}`;
      const [[, count], [, ttl]] = (await r
        .multi()
        .incr(k)
        .ttl(k)
        .exec()) as [[unknown, number], [unknown, number]];
      if (ttl < 0) await r.expire(k, windowSec);
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetSeconds: ttl > 0 ? ttl : windowSec,
      };
    } catch {
      // fall through to memory
    }
  }
  return memoryLimit(key, limit, windowSec);
}
