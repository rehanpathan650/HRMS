import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// HTTPS-only directives (HSTS, upgrade-insecure-requests) are enabled only when served over HTTPS.
const isHttps = (process.env.APP_URL ?? "").startsWith("https://");

// Allow presigned S3 URLs for selfies/avatars when the S3 driver is used.
const s3Origin = (() => {
  if (process.env.STORAGE_DRIVER !== "s3") return "";
  try {
    return process.env.S3_ENDPOINT ? new URL(process.env.S3_ENDPOINT).origin : "https://*.amazonaws.com";
  } catch {
    return "";
  }
})();

const tiles = "https://tile.openstreetmap.org";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  `img-src 'self' data: blob: ${tiles} ${s3Origin}`.trim(),
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isHttps ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(!isHttps ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  // Self-hosting (npm start / Docker) uses the standalone server; Vercel uses its own output.
  output: process.env.VERCEL ? undefined : "standalone",
  // Lets a verification build run without touching the live build folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "bcryptjs", "exceljs", "ioredis"],
  // exceljs reaches {generator,async}-function/require.mjs through dynamic requires that
  // Next's file tracer can't see; without this the standalone build's Excel export fails.
  outputFileTracingIncludes: {
    "/api/admin/reports": ["./node_modules/generator-function/**/*", "./node_modules/async-function/**/*"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API responses are never cached by shared caches and never framed.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
