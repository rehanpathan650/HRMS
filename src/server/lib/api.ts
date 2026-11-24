import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { ApiError, badRequest, forbidden, tooMany, unauthorized } from "./errors";
import { getSession, type SessionUser } from "./session";
import { rateLimit } from "./rate-limit";
import { requestMeta } from "./request";
import { env } from "./env";
import { db } from "./db";

type AuthMode = "PUBLIC" | "ANY" | "ADMIN" | "EMPLOYEE";

interface RouteOptions<B extends ZodTypeAny | undefined, Q extends ZodTypeAny | undefined> {
  auth: AuthMode;
  body?: B;
  query?: Q;
  /** requests per minute per user (or IP when public). Default 120. */
  rateLimit?: { limit: number; windowSec?: number; key?: string };
  /** Max JSON body size in bytes. Default 64 KB. */
  maxBodyBytes?: number;
  /** Skip JSON body parsing (e.g. multipart handlers). */
  rawBody?: boolean;
  /** Allow users flagged with mustChangePassword. Default false. */
  allowPasswordChangePending?: boolean;
}

type Ctx<B, Q, A extends AuthMode> = {
  req: NextRequest;
  params: Record<string, string>;
  body: B;
  query: Q;
  user: A extends "PUBLIC" ? SessionUser | null : SessionUser;
  ip: string;
  userAgent: string;
};

type Infer<T> = T extends ZodTypeAny ? z.infer<T> : undefined;

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function checkCsrf(req: NextRequest) {
  // 1) Custom header: cannot be set cross-origin without a CORS preflight we never approve.
  if (req.headers.get("x-attendly-csrf") !== "1") throw forbidden("Missing CSRF header");
  // 2) Origin (when sent) must be our own origin.
  const origin = req.headers.get("origin");
  if (origin) {
    const allowed = new Set([new URL(env().APP_URL).origin, req.nextUrl.origin]);
    if (!allowed.has(origin)) throw forbidden("Cross-origin request blocked");
  }
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: err.issues[0]?.message ?? "Invalid input",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "A record with these details already exists." } },
        { status: 409 },
      );
    }
    if (err.code === "P2025") {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, { status: 404 });
    }
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}

export function route<
  A extends AuthMode,
  B extends ZodTypeAny | undefined = undefined,
  Q extends ZodTypeAny | undefined = undefined,
>(
  opts: RouteOptions<B, Q> & { auth: A },
  handler: (ctx: Ctx<Infer<B>, Infer<Q>, A>) => Promise<unknown>,
) {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    try {
      const { ip, userAgent } = await requestMeta();
      const method = req.method.toUpperCase();
      if (MUTATING.has(method)) checkCsrf(req);

      let user: SessionUser | null = null;
      if (opts.auth !== "PUBLIC") {
        user = await getSession();
        if (!user) throw unauthorized();
        if (opts.auth === "ADMIN" && user.role !== "ADMIN") throw forbidden();
        if (opts.auth === "EMPLOYEE" && !user.employee) throw forbidden("An employee profile is required");
        if (user.mustChangePassword && !opts.allowPasswordChangePending) {
          throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "You must change your password before continuing.");
        }
      } else {
        user = await getSession();
      }

      const rl = opts.rateLimit ?? { limit: 120 };
      const rlKey = `${rl.key ?? req.nextUrl.pathname.split("/").slice(0, 4).join("/")}:${method}:${user?.id ?? ip}`;
      const result = await rateLimit(rlKey, rl.limit, rl.windowSec ?? 60);
      if (!result.allowed) throw tooMany();

      let body: unknown = undefined;
      if (opts.body && !opts.rawBody) {
        const max = opts.maxBodyBytes ?? 64 * 1024;
        const len = Number(req.headers.get("content-length") ?? 0);
        if (len > max) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
        const text = await req.text();
        if (text.length > max) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
        let json: unknown;
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          throw badRequest("Malformed JSON body");
        }
        body = opts.body.parse(json);
      }

      let query: unknown = undefined;
      if (opts.query) {
        query = opts.query.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
      }

      const params = (await context.params) ?? {};
      const out = await handler({
        req,
        params,
        body: body as Infer<B>,
        query: query as Infer<Q>,
        user: user as Ctx<Infer<B>, Infer<Q>, A>["user"],
        ip,
        userAgent,
      });
      if (out instanceof Response) return out;
      return NextResponse.json({ data: out ?? null }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/**
 * Idempotency for state-changing endpoints. A repeated request with the same
 * key returns the original response instead of re-executing.
 */
export async function withIdempotency<T>(
  userId: string,
  endpoint: string,
  key: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  if (!key) throw badRequest("Idempotency-Key header is required");
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(key)) throw badRequest("Invalid Idempotency-Key");
  const existing = await db.idempotencyKey.findUnique({
    where: { userId_endpoint_key: { userId, endpoint, key } },
  });
  if (existing) return existing.response as T;
  const result = await fn();
  await db.idempotencyKey
    .create({
      data: { userId, endpoint, key, statusCode: 200, response: result as Prisma.InputJsonValue },
    })
    .catch(() => {});
  return result;
}
