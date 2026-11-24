/* eslint-disable @typescript-eslint/no-explicit-any -- test script reads loosely-typed JSON responses */
/**
 * End-to-end API smoke test against a running server.
 *   BASE_URL=http://localhost:3000 npm run test:api
 *
 * Creates its own throwaway employee (via the admin API) so demo accounts
 * aren't touched, then exercises auth, RBAC, CSRF, attendance, leave,
 * verification, reports and audit immutability.
 */
import { PrismaClient } from "@prisma/client";
import { deflateSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
/** Admin password comes from SMOKE_ADMIN_PASSWORD or the gitignored CREDENTIALS.local.md. */
function adminPassword() {
  if (process.env.SMOKE_ADMIN_PASSWORD) return process.env.SMOKE_ADMIN_PASSWORD;
  try {
    const md = readFileSync(path.resolve("CREDENTIALS.local.md"), "utf8");
    const m = md.match(/`admin@company\.com`\s*\|\s*`([^`]+)`/);
    if (m) return m[1];
  } catch {
    /* fall through */
  }
  console.error("Set SMOKE_ADMIN_PASSWORD or run `npm run accounts:provision` first.");
  process.exit(1);
}
const ADMIN = { email: "admin@company.com", password: adminPassword() };
const db = new PrismaClient();

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✘ ${name}\x1b[0m`, extra ?? "");
  }
}

class Client {
  cookie = "";
  async req(method: string, path: string, body?: unknown, opts: { csrf?: boolean; idem?: string; form?: FormData } = {}) {
    const headers: Record<string, string> = {};
    if (this.cookie) headers.cookie = this.cookie;
    if (method !== "GET" && opts.csrf !== false) headers["x-attendly-csrf"] = "1";
    if (opts.idem) headers["idempotency-key"] = opts.idem;
    let payload: BodyInit | undefined;
    if (opts.form) payload = opts.form;
    else if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(BASE + "/api" + path, { method, headers, body: payload, redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const [pair] = c.split(";");
      if (pair.includes("session=")) this.cookie = pair.endsWith("=") ? "" : pair;
    }
    const text = await res.text();
    let json: { data?: any; error?: { code: string; message: string } } = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* non-json */
    }
    return { status: res.status, data: json.data, error: json.error, text, headers: res.headers };
  }
  get = (p: string) => this.req("GET", p);
  post = (p: string, b?: unknown, o?: { csrf?: boolean; idem?: string; form?: FormData }) => this.req("POST", p, b, o);
}

function png() {
  const W = 8, H = 8;
  const raw = Buffer.alloc((W * 3 + 1) * H, 0x7f);
  for (let y = 0; y < H; y++) raw[y * (W * 3 + 1)] = 0;
  const chunk = (t: string, d: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(d.length);
    return Buffer.concat([len, Buffer.from(t), d, Buffer.alloc(4)]); // CRC not validated by our sniffer
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("tEXt", Buffer.from(randomBytes(8).toString("hex"))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const key = () => randomBytes(16).toString("hex");
const selfieForm = (buf: Buffer, type = "image/png") => {
  const fd = new FormData();
  fd.append("selfie", new Blob([new Uint8Array(buf)], { type }), "selfie.png");
  return fd;
};

async function main() {
  console.log(`Smoke testing ${BASE}\n`);
  const anon = new Client();
  const admin = new Client();
  const emp = new Client();

  console.log("Auth & CSRF");
  check("unauthenticated /auth/me → 401", (await anon.get("/auth/me")).status === 401);
  check("wrong password → 401", (await anon.post("/auth/login", { email: ADMIN.email, password: "nope-nope-nope" })).status === 401);
  check("POST without CSRF header → 403", (await anon.post("/auth/login", ADMIN, { csrf: false })).status === 403);
  check("cross-origin Origin header → 403", await (async () => {
    const r = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "x-attendly-csrf": "1", origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify(ADMIN) });
    return r.status === 403;
  })());
  const login = await admin.post("/auth/login", ADMIN);
  check("admin login → 200", login.status === 200 && login.data?.role === "ADMIN", login.error);
  check("security headers present", !!(await fetch(BASE + "/login")).headers.get("content-security-policy"));

  console.log("\nEmployee provisioning");
  const lookups = await admin.get("/admin/lookups");
  const code = `QA-${randomBytes(3).toString("hex").toUpperCase()}`;
  const email = `qa.${code.toLowerCase()}@company.com`;
  const created = await admin.post("/admin/employees", {
    firstName: "Qa",
    lastName: "Tester",
    email,
    employeeCode: code,
    designation: "QA Bot",
    joiningDate: "2024-01-01",
    departmentId: lookups.data.departments[0].id,
    status: "ACTIVE",
    role: "EMPLOYEE",
    allowRemote: false,
  });
  check("admin creates employee", created.status === 200 && !!created.data?.temporaryPassword, created.error);
  const empId = created.data.employee.id as string;
  const temp = created.data.temporaryPassword as string;
  const dup = await admin.post("/admin/employees", { ...created.data.employee, email, employeeCode: code, joiningDate: "2024-01-01", departmentId: null, managerId: null, workScheduleId: null, officeLocationId: null, role: "EMPLOYEE" });
  check("duplicate email/code → 409", dup.status === 409, dup.status);

  check("employee login with temp password", (await emp.post("/auth/login", { email, password: temp })).data?.mustChangePassword === true);
  check("API blocked until password change → 403", (await emp.get("/attendance/today")).error?.code === "PASSWORD_CHANGE_REQUIRED");
  check("weak new password rejected → 422", (await emp.post("/auth/change-password", { currentPassword: temp, newPassword: "short", confirmPassword: "short" })).status === 422);
  const newPw = "Qa-Tester#2026!";
  check("password changed", (await emp.post("/auth/change-password", { currentPassword: temp, newPassword: newPw, confirmPassword: newPw })).status === 200);

  console.log("\nRBAC");
  check("employee → admin overview 403", (await emp.get("/admin/overview")).status === 403);
  check("employee → admin employees 403", (await emp.get("/admin/employees")).status === 403);
  check("employee cannot review leave", (await emp.post("/admin/leaves/xxxxxxxxxxxx/review", { decision: "APPROVE" })).status === 403);
  check("employee cannot change settings", (await emp.req("PUT", "/admin/settings", {})).status === 403);
  check("employee profile cannot set role (field ignored)", await (async () => {
    await emp.req("PATCH", "/me/profile", { phone: "+91 90000 00000", role: "ADMIN" });
    const u = await db.user.findUnique({ where: { email } });
    return u?.role === "EMPLOYEE";
  })());

  console.log("\nAttendance");
  const today = await emp.get("/attendance/today");
  check("today state NOT_CHECKED_IN", today.data?.state === "NOT_CHECKED_IN", today.data?.state);
  const office = today.data.office as { latitude: number; longitude: number };

  check("non-image selfie rejected → 400", (await emp.post("/attendance/selfie", undefined, { form: selfieForm(Buffer.from("not an image at all, definitely"), "image/png") })).status === 400);
  check("oversized selfie rejected → 413", (await emp.post("/attendance/selfie", undefined, { form: selfieForm(Buffer.alloc(3.5 * 1024 * 1024, 1)) })).status === 413);
  const up1 = await emp.post("/attendance/selfie", undefined, { form: selfieForm(png()) });
  check("selfie upload → uploadId", !!up1.data?.uploadId, up1.error);

  check("check-in without selfie → 422", (await emp.post("/attendance/check-in", { latitude: office.latitude, longitude: office.longitude, accuracy: 10 }, { idem: key() })).status === 422);
  check("check-in without idempotency key → 400", (await emp.post("/attendance/check-in", { latitude: office.latitude, longitude: office.longitude, accuracy: 10, selfieUploadId: up1.data.uploadId })).status === 400);
  check("invalid coordinates → 422", (await emp.post("/attendance/check-in", { latitude: 123, longitude: 0, accuracy: 10, selfieUploadId: up1.data.uploadId }, { idem: key() })).status === 422);
  const far = await emp.post("/attendance/check-in", { latitude: office.latitude + 0.05, longitude: office.longitude, accuracy: 10, selfieUploadId: up1.data.uploadId }, { idem: key() });
  check("outside geofence (no remote) → 422 OUTSIDE_GEOFENCE", far.error?.code === "OUTSIDE_GEOFENCE", far.error);

  const idem = key();
  const body = { latitude: office.latitude + 0.0003, longitude: office.longitude, accuracy: 15, selfieUploadId: up1.data.uploadId, positionTimestamp: Date.now() - 365 * 86400000 };
  const ci = await emp.post("/attendance/check-in", body, { idem });
  check("check-in inside geofence → 200", ci.status === 200, ci.error);
  check("server timestamp used (client ts ignored)", Math.abs(new Date(ci.data?.checkInAt).getTime() - Date.now()) < 120_000);
  const replay = await emp.post("/attendance/check-in", body, { idem });
  check("replay with same idempotency key returns original", replay.status === 200 && replay.data?.id === ci.data?.id);
  const up2 = await emp.post("/attendance/selfie", undefined, { form: selfieForm(png()) });
  check("second check-in → 409", (await emp.post("/attendance/check-in", { ...body, selfieUploadId: up2.data.uploadId }, { idem: key() })).status === 409);
  check("today state CHECKED_IN", (await emp.get("/attendance/today")).data?.state === "CHECKED_IN");

  const empRow = await db.employee.findUniqueOrThrow({ where: { id: empId } });
  const other = await db.selfieUpload.findFirst({ where: { employeeId: { not: empRow.id } } });
  if (other) {
    const ownAdmin = await admin.get(`/admin/attendance/${ci.data.id}`);
    const selfieUrl = ownAdmin.data?.evidence?.[0]?.selfie?.url as string;
    check("admin gets signed selfie URL", !!selfieUrl);
    const viaAdmin = await fetch(BASE + selfieUrl, { headers: { cookie: admin.cookie } });
    check("admin can view selfie", viaAdmin.status === 200 && viaAdmin.headers.get("content-type") === "image/png");
    const tampered = await fetch(BASE + selfieUrl.replace(/sig=[^&]+/, "sig=AAAA"), { headers: { cookie: admin.cookie } });
    check("tampered signature → 403", tampered.status === 403);
    const anonView = await fetch(BASE + selfieUrl);
    check("selfie without session → 401", anonView.status === 401);
  }

  const out = await emp.post("/attendance/check-out", { latitude: office.latitude, longitude: office.longitude, accuracy: 12 }, { idem: key() });
  check("check-out → 200 with worked minutes", out.status === 200 && typeof out.data?.workedMinutes === "number", out.error);
  check("duplicate check-out → 409", (await emp.post("/attendance/check-out", { latitude: office.latitude, longitude: office.longitude, accuracy: 12 }, { idem: key() })).status === 409);

  console.log("\nDatabase integrity");
  check("evidence coordinates immutable (trigger)", await db.attendanceEvidence.updateMany({ where: { attendanceId: ci.data.id }, data: { latitude: 1 } }).then(() => false, () => true));
  check("audit log UPDATE blocked (trigger)", await db.auditLog.updateMany({ where: {}, data: { action: "tampered" } }).then(() => false, () => true));
  check("audit log DELETE blocked (trigger)", await db.auditLog.deleteMany({ where: { action: "auth.login" } }).then(() => false, () => true));
  check("one open attendance per employee (partial unique index)", await db.attendance.create({ data: { employeeId: empId, workDate: new Date("2000-01-01"), checkInAt: new Date(), status: "PRESENT", verificationStatus: "AUTO_APPROVED", scheduleSnapshot: {} } })
    .then(async (a) => db.attendance.create({ data: { employeeId: empId, workDate: new Date("2000-01-02"), checkInAt: new Date(), status: "PRESENT", verificationStatus: "AUTO_APPROVED", scheduleSnapshot: {} } }).then(() => false, async () => { await db.attendance.delete({ where: { id: a.id } }); return true; })));

  console.log("\nVerification");
  const rev = await admin.post(`/admin/attendance/${ci.data.id}/review`, { decision: "REJECT", note: "QA rejection" });
  check("admin rejects attendance", rev.data?.status === "REJECTED", rev.error);
  const notes = await emp.get("/notifications");
  check("employee notified of rejection", notes.data?.items.some((n: { type: string }) => n.type === "ATTENDANCE_REJECTED"));

  console.log("\nLeave");
  const types = await emp.get("/leave-types");
  const annual = types.data.find((t: { code: string }) => t.code === "AL");
  check("end before start → 422", (await emp.post("/leaves", { leaveTypeId: annual.id, startDate: "2026-12-10", endDate: "2026-12-01", reason: "Testing invalid" }, { idem: key() })).status === 422);
  const nextMon = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7) + 14); return d.toISOString().slice(0, 10); })();
  const plus1 = new Date(Date.parse(nextMon) + 86400000).toISOString().slice(0, 10);
  const lv = await emp.post("/leaves", { leaveTypeId: annual.id, startDate: nextMon, endDate: plus1, reason: "QA family trip" }, { idem: key() });
  check("apply leave → 200 (2 days)", lv.status === 200 && lv.data?.days === 2, lv.error);
  check("overlapping leave → 409", (await emp.post("/leaves", { leaveTypeId: annual.id, startDate: plus1, endDate: plus1, reason: "QA overlap" }, { idem: key() })).status === 409);
  check("over-balance leave → 409", (await emp.post("/leaves", { leaveTypeId: annual.id, startDate: "2026-12-01", endDate: "2026-12-31", reason: "QA too long" }, { idem: key() })).status === 409);
  const ap = await admin.post(`/admin/leaves/${lv.data.id}/review`, { decision: "APPROVE", comment: "Enjoy" });
  check("admin approves leave", ap.data?.status === "APPROVED", ap.error);
  check("double approval → 409", (await admin.post(`/admin/leaves/${lv.data.id}/review`, { decision: "APPROVE" })).status === 409);
  const bal = await emp.get("/leaves/balances");
  check("balance deducted", bal.data.find((b: { leaveType: { code: string } }) => b.leaveType.code === "AL")?.used === 2);

  console.log("\nAnalytics & reports");
  const ov = await admin.get("/admin/overview?days=14");
  check("overview metrics", ov.status === 200 && ov.data.metrics.totalEmployees > 0 && ov.data.trend.length === 14);
  const csv = await admin.get(`/admin/reports?type=employee&from=${today.data.workDate.slice(0, 8)}01&to=${today.data.workDate}&format=csv`);
  check("CSV export", csv.status === 200 && !!csv.headers.get("content-type")?.includes("text/csv") && csv.text.includes("Employee ID"));
  const xlsx = await fetch(`${BASE}/api/admin/reports?type=hours&from=${today.data.workDate}&to=${today.data.workDate}&format=xlsx`, { headers: { cookie: admin.cookie } });
  check("Excel export", xlsx.status === 200 && (await xlsx.arrayBuffer()).byteLength > 1000);
  const audit = await admin.get("/admin/audit-logs?search=attendance.reject");
  check("review written to audit log", audit.data?.items.some((i: { entityId: string }) => i.entityId === ci.data.id));

  console.log("\nEmployee deletion");
  check("delete employee with attendance history → 409", (await admin.req("DELETE", `/admin/employees/${empId}`)).status === 409);
  const tmpCode = `QB-${randomBytes(3).toString("hex").toUpperCase()}`;
  const tmp = await admin.post("/admin/employees", {
    firstName: "Temp", lastName: "Hire", email: `${tmpCode.toLowerCase()}@company.com`, employeeCode: tmpCode,
    designation: "Temp", joiningDate: "2025-01-01", status: "ACTIVE", role: "EMPLOYEE", allowRemote: false,
  });
  check("delete employee without history → 200", (await admin.req("DELETE", `/admin/employees/${tmp.data?.employee.id}`)).status === 200);

  console.log("\nSession lifecycle");
  await admin.req("PATCH", `/admin/employees/${empId}`, { status: "INACTIVE" });
  check("deactivated employee session revoked → 401", (await emp.get("/attendance/today")).status === 401);
  check("deactivated employee cannot log in", (await new Client().post("/auth/login", { email, password: newPw })).status === 403);
  const lo = await admin.post("/auth/logout");
  check("logout", lo.status === 200);
  check("session invalid after logout", (await admin.get("/auth/me")).status === 401);

  // Clean up QA user data (audit trail is retained by design).
  await db.leaveRequest.deleteMany({ where: { employeeId: empId } });
  await db.attendance.deleteMany({ where: { employeeId: empId } });
  await db.user.delete({ where: { email } });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
