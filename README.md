# Attendly — Smart Workforce Management

A full-stack HRMS with **location- and selfie-verified attendance**, leave management, employee administration, analytics and an immutable audit trail. Two roles: **Admin** and **Employee**.

Built with Next.js 15 (App Router) · TypeScript · PostgreSQL + Prisma · Redis · Tailwind CSS v4 + shadcn/ui · TanStack Query · React Hook Form + Zod · Framer Motion + GSAP · Recharts · Leaflet.

---

## Quick start (local development)

Prerequisites: Node.js 20+ and Docker.

```bash
cp .env.example .env                     # then set APP_SECRET (see below)
docker compose up -d db redis            # PostgreSQL 16 + Redis 7
npm install
npm run db:deploy                        # apply migrations
npm run db:seed                          # demo data (development only)
npm run dev                              # http://localhost:3000
```

Generate `APP_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Demo accounts (development only)

| Role     | Email                  | Password                |
| -------- | ---------------------- | ----------------------- |
| Admin    | `admin@company.com`    | `Admin@Attendly2026`    |
| Employee | `employee@company.com` | `Employee@Attendly2026` |

Passwords come from `SEED_ADMIN_PASSWORD` / `SEED_EMPLOYEE_PASSWORD`. The seed **refuses to run when `NODE_ENV=production`**. Before any real deployment, do not seed; create the first admin yourself (or seed once with strong, unique passwords and change them immediately). Users created by an admin get a one-time temporary password and are forced to change it at first sign-in.

The seed creates a company ("Northwind Labs", timezone `Asia/Kolkata`), an office geofence in Bengaluru (200 m), three shifts (incl. an overnight shift), six departments, four leave types, 22 employees and ~6 weeks of attendance history with placeholder selfie images so the dashboards have data. Demo employee `employee@company.com` is left un-checked-in for today so you can try the check-in flow.

> **Testing check-in from elsewhere:** the demo office is in Bengaluru, so a real GPS fix from another city will be rejected (outside the geofence). Either move the office (Admin → Settings → Offices → "Use my location"), enable **Allow remote check-in** for the employee, or enable remote attendance in policy settings.

Camera and geolocation require a **secure context**: `http://localhost` works; any other host needs HTTPS.

### Full stack in Docker

```bash
docker compose --profile app up -d --build
docker compose exec app node node_modules/prisma/build/index.js db seed   # optional, dev only
```

The app container runs `prisma migrate deploy` on start.

---

## Scripts

| Command              | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `npm run dev`        | Development server                                       |
| `npm run build`      | `prisma generate` + production build (standalone output) |
| `npm start`          | Run the production build                                 |
| `npm run typecheck`  | TypeScript check                                         |
| `npm run lint`       | ESLint                                                   |
| `npm run db:migrate` | Create/apply a migration in development                  |
| `npm run db:deploy`  | Apply migrations (CI / production)                       |
| `npm run db:seed`    | Seed demo data (refuses in production)                   |
| `npm run db:reset`   | Drop, re-migrate and re-seed (development)               |
| `npm run retention`  | Apply data-retention policy (schedule daily via cron)    |
| `npm run test:api`   | End-to-end API smoke test against a running server       |

`npm run test:api` (with the server running) provisions a throwaway employee through the admin API and verifies ~50 behaviors: CSRF and origin checks, RBAC on admin endpoints, forced password change, selfie validation (magic bytes, size), geofence rejection, idempotent replay, duplicate check-in/out prevention, server-side timestamps, signed-URL tampering, DB-level immutability triggers, leave overlap/balance rules, approvals, reports export, audit logging, deactivation and logout. It cleans up after itself.

---

## Architecture

```
prisma/
  schema.prisma          normalized schema (13 models)
  migrations/            SQL migrations incl. hand-written integrity triggers
  seed.ts                development seed
scripts/                 retention job, API smoke test
src/
  middleware.ts          edge redirect for unauthenticated page access (UX only)
  app/
    (auth)/              login, forgot/reset/change password
    admin/…              admin pages (server layout enforces ADMIN role)
    employee/…           employee pages (server layout enforces employee profile)
    api/…                REST route handlers
  server/
    lib/                 env, db, session, api wrapper (auth/RBAC/CSRF/rate limit/validation),
                         audit, storage, rate-limit, geo (Haversine), timezone helpers
    services/            attendance, leave, employees, analytics, reports, retention, notifications
  lib/
    validators/          Zod schemas shared by client forms and API
    api-client.ts        centralized fetch client (CSRF header, idempotency, errors)
  hooks/                 useCamera, useGeolocation, useNow, useGsapReveal, data hooks
  components/            ui (shadcn), layout shell, attendance flow, charts, map, admin widgets
```

Every route handler is wrapped by `route()` (`src/server/lib/api.ts`), which performs — in order — CSRF checks on mutating requests, session lookup, role enforcement (`PUBLIC | ANY | EMPLOYEE | ADMIN`), forced-password-change gating, rate limiting, body size limits, Zod validation of body and query, and uniform error responses that never leak internals.

### Pages

Public: `/login`, `/forgot-password`, `/reset-password`, `/change-password`
Employee: `/employee/dashboard`, `/employee/attendance`, `/employee/attendance/history`, `/employee/leaves`, `/employee/leaves/apply`, `/employee/profile`, `/employee/settings`
Admin: `/admin/dashboard`, `/admin/employees`, `/admin/employees/[id]`, `/admin/attendance`, `/admin/attendance/verification`, `/admin/attendance/reports`, `/admin/leaves`, `/admin/departments`, `/admin/reports`, `/admin/settings`, `/admin/audit-logs`

Admins who also have an employee profile can switch to "My attendance" from the user menu.

---

## Attendance: how it works

**Check-in** (employee clicks *Check in*):

1. Browser geolocation is requested (high accuracy, no cached fix) — only in response to the click.
2. The position is shown on a map with the office geofence, distance and accuracy. If the employee is outside the radius and remote check-in isn't allowed, the flow stops here.
3. The camera opens (`getUserMedia`, front camera preferred) with a live preview and face guide. Gallery/file uploads are not offered.
4. The captured selfie is previewed (retake/confirm), then uploaded. The server sniffs magic bytes (JPEG/PNG/WebP only), enforces 3 MB, hashes it (SHA-256) and stores it privately. It returns a **single-use upload ID valid for 10 minutes**.
5. Coordinates, accuracy and the upload ID are sent to `/api/attendance/check-in` with an `Idempotency-Key`.
6. The server: validates ranges, uses **its own clock** (the client timestamp is stored for forensics only), resolves the work date in the company timezone (overnight shifts handled), rejects duplicates / approved-leave days, recomputes the Haversine distance itself, atomically claims the selfie, computes lateness against the employee's shift + grace period, raises risk flags and writes the attendance + evidence + audit + notifications in one transaction.

**Risk signals** (sent to the verification queue): outside geofence (remote), low GPS accuracy (> configured max), implausibly perfect accuracy (< 1 m), reused selfie (same hash), impossible travel (> 300 km/h since last punch), no office configured. Non-working-day punches are flagged informationally. If *auto-approve clean check-ins* is off, every record is reviewed.

**Check-out** captures location (and an optional or required selfie), computes worked minutes (break deducted for sessions ≥ 5 h), early departure and half-day status (below the shift's half-day threshold). A conditional update guarantees a record can be checked out only once.

**Integrity guarantees** enforced in PostgreSQL, not just the app:
- unique `(employeeId, workDate)` and a partial unique index allowing only **one open session per employee**;
- `AttendanceEvidence` coordinates/timestamps are **immutable** (trigger);
- `AuditLog` is **append-only** — UPDATE always fails, DELETE fails unless the retention job opts in within its transaction;
- CHECK constraints on coordinate ranges, radius, leave date order, check-out ≥ check-in.

Employees have no endpoint that modifies attendance. Admins can only approve/reject (with a note); every decision — and every view of evidence — is audited.

> **Limitations, stated plainly.** GPS coordinates come from the device and can be spoofed by a determined user; location is treated as a **risk signal**, not proof. Attendly does **not** perform facial recognition or liveness detection. Selfies are stored as evidence for human review. The evidence model (`SelfieUpload` with hash/metadata, risk flags, `riskScore`) is designed so a face-match or liveness provider can be added as another signal later.

---

## Security

- **Passwords:** bcrypt (cost 12), strength policy, constant-time handling for unknown accounts, lockout after 5 failures (15 min), per-IP and per-account login throttling.
- **Sessions:** opaque 256-bit random token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` + `__Host-` prefix in production); only its SHA-256 hash is stored. Configurable TTL, revocation on logout, password change/reset (other sessions), deactivation and role change.
- **Password reset:** single-use, hashed, 30-minute tokens; identical responses for existing and non-existing accounts.
- **Authorization:** enforced server-side on every API route and in server layouts; employees can only read their own data. Self-demotion, self-deactivation, removing the last admin, reviewing one's own leave and manager cycles are blocked.
- **CSRF:** required custom header on all mutating requests (cannot be sent cross-site without a CORS preflight, which the API never approves) plus `Origin` verification and `SameSite` cookies.
- **Headers:** strict CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (camera/geolocation self-only), COOP, and HSTS + `upgrade-insecure-requests` when `APP_URL` is HTTPS.
- **Input:** Zod on every body/query, JSON body size limits, upload size + magic-byte validation, Prisma parameterized queries, React escaping, CSV/Excel formula-injection neutralization.
- **Rate limiting:** Redis fixed-window (falls back to in-memory when `REDIS_URL` is unset or unavailable).
- **Replay protection:** `Idempotency-Key` required for check-in/out and leave applications; single-use, short-lived selfie upload IDs.
- **Private evidence:** selfies are never in `/public`. Local storage serves them only through **5-minute HMAC-signed URLs that also require an authorized session** (admin or the owning employee). The S3 driver uses presigned URLs on a private bucket.
- **Retention:** selfie images deleted after `selfieRetentionDays` (default 180; hash + metadata kept), audit entries after `auditRetentionDays` (default 730), plus cleanup of expired sessions/tokens/orphan uploads. Run `npm run retention` daily or trigger it from Settings → System.
- **Secrets:** all from environment variables, validated at startup.

### Production checklist

- Serve over HTTPS and set `APP_URL=https://…`.
- Strong random `APP_SECRET`; managed PostgreSQL with backups; Redis for multi-instance rate limiting.
- `STORAGE_DRIVER=s3` with a **private** bucket (multi-instance deployments cannot share local disk).
- Do not run the seed. Create the first admin, then rotate its password.
- Set `DEV_EXPOSE_RESET_LINK=false` and integrate an email provider in `src/app/api/auth/forgot-password/route.ts` (the reset link is currently written to the server log).
- Schedule `npm run retention` daily (local storage) or use the admin action / S3 lifecycle rules.

---

## Environment variables

See [`.env.example`](.env.example) for the full list with descriptions. Required: `DATABASE_URL`, `APP_SECRET`. Optional: `REDIS_URL` (falls back to memory), S3 settings (falls back to local private storage).

## Third-party services

- **Map tiles:** OpenStreetMap standard tiles (no key; subject to the OSM tile usage policy). Swap the URL in `src/components/map/geo-map-inner.tsx` for a commercial provider at scale.
- **Email:** not bundled; see the production checklist.
