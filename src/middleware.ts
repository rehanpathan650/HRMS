import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

/**
 * Edge-level gate: bounces unauthenticated visitors away from app pages early.
 * This is a UX optimization only — real authentication and role checks happen
 * server-side in layouts (pages) and in every API handler.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if ((pathname.startsWith("/admin") || pathname.startsWith("/employee")) && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // CORS: the API is same-origin only. Reject cross-origin preflights outright.
  if (pathname.startsWith("/api/") && req.method === "OPTIONS") {
    return new NextResponse(null, { status: 405 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/employee/:path*", "/api/:path*"],
};
