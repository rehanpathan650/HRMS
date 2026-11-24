/**
 * Development seed. Creates demo accounts, org structure and ~6 weeks of
 * attendance history so dashboards have data to show.
 *
 * Refuses to run when NODE_ENV=production.
 */
import { PrismaClient, type AttendanceStatus, type VerificationStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";
import { promises as fs } from "node:fs";
import path from "node:path";
import { addDays, dateOnly, isoWeekday, localDateString, localMinuteOfDay, zonedTimeToUtc } from "../src/server/lib/time";
import { haversineMeters } from "../src/server/lib/geo";

const db = new PrismaClient();
const TZ = "Asia/Kolkata";
const OFFICE = { lat: 12.9352, lng: 77.6245 }; // Koramangala, Bengaluru

if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "true") {
  console.error("Refusing to seed demo data in production.");
  process.exit(1);
}

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "Admin@Attendly2026";
const EMPLOYEE_PASSWORD = process.env.SEED_EMPLOYEE_PASSWORD || "Employee@Attendly2026";

// Deterministic PRNG so the seed is reproducible.
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => a + rand() * (b - a);

// ─── Tiny PNG generator for placeholder selfies ──────────────────────────
function crc32(buf: Buffer) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** Soft portrait-like placeholder: gradient background + head/shoulders silhouette. */
function placeholderSelfie(hue: number) {
  const W = 240, H = 300;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  const hsl = (h: number, s: number, l: number) => {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  };
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const head = (x - W / 2) ** 2 / 55 ** 2 + (y - 120) ** 2 / 68 ** 2 <= 1;
      const body = y > 200 && (x - W / 2) ** 2 / 105 ** 2 + (y - 320) ** 2 / 120 ** 2 <= 1;
      const [r, g, b] = head
        ? hsl(28, 0.45, 0.68)
        : body
          ? hsl(hue, 0.35, 0.35)
          : hsl(hue, 0.25, 0.86 - (y / H) * 0.12);
      const o = y * (W * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    // Random text chunk so every placeholder hashes uniquely (no false DUPLICATE_SELFIE).
    chunk("tEXt", Buffer.from(`seed\0${randomBytes(6).toString("hex")}`)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const storageDir = path.resolve(process.env.STORAGE_LOCAL_DIR || "./storage");
async function saveSelfie(employeeId: string, hue: number, createdAt: Date) {
  const unique = placeholderSelfie(hue + Math.floor(rand() * 20));
  const key = `selfies/${employeeId}/${createdAt.toISOString().slice(0, 7)}/${randomBytes(12).toString("hex")}.png`;
  if ((process.env.STORAGE_DRIVER || "local") === "local") {
    const full = path.join(storageDir, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, unique);
  }
  return db.selfieUpload.create({
    data: {
      employeeId,
      storageKey: key,
      mimeType: "image/png",
      sizeBytes: unique.length,
      sha256: createHash("sha256").update(unique).digest("hex"),
      createdAt,
      consumedAt: createdAt,
    },
  });
}

const PEOPLE: [string, string, string, string][] = [
  ["Arjun", "Mehta", "ENG", "Staff Engineer"],
  ["Priya", "Nair", "ENG", "Senior Frontend Engineer"],
  ["Karthik", "Iyer", "ENG", "Backend Engineer"],
  ["Sneha", "Kulkarni", "ENG", "QA Engineer"],
  ["Vikram", "Singh", "ENG", "DevOps Engineer"],
  ["Ananya", "Reddy", "PRD", "Product Manager"],
  ["Rohan", "Desai", "PRD", "Associate PM"],
  ["Meera", "Joshi", "DES", "Product Designer"],
  ["Ishaan", "Kapoor", "DES", "Brand Designer"],
  ["Divya", "Menon", "SAL", "Account Executive"],
  ["Aditya", "Bose", "SAL", "Sales Development Rep"],
  ["Kavya", "Pillai", "SAL", "Customer Success Lead"],
  ["Nikhil", "Chopra", "FIN", "Finance Analyst"],
  ["Pooja", "Bhat", "FIN", "Accountant"],
  ["Siddharth", "Rao", "PEO", "Talent Partner"],
  ["Tanvi", "Shah", "ENG", "Mobile Engineer"],
  ["Harsh", "Agarwal", "ENG", "Data Engineer"],
  ["Riya", "Malhotra", "PRD", "Product Analyst"],
  ["Aman", "Gupta", "SAL", "Solutions Engineer"],
  ["Neha", "Saxena", "PEO", "HR Generalist"],
];

async function main() {
  const existing = await db.user.findUnique({ where: { email: "admin@company.com" } });
  if (existing) {
    console.log("Database already seeded (admin@company.com exists). Run `npm run db:reset` to start fresh.");
    return;
  }
  console.log("Seeding Attendly demo data…");

  await db.systemSetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", companyName: "Northwind Labs", timezone: TZ },
  });

  const general = await db.workSchedule.create({
    data: { name: "General shift", startMinute: 9 * 60 + 30, endMinute: 18 * 60 + 30, graceMinutes: 15, breakMinutes: 60, halfDayMinutes: 240, workDays: [1, 2, 3, 4, 5], isDefault: true },
  });
  const early = await db.workSchedule.create({
    data: { name: "Early shift", startMinute: 7 * 60, endMinute: 16 * 60, graceMinutes: 10, breakMinutes: 45, halfDayMinutes: 240, workDays: [1, 2, 3, 4, 5, 6] },
  });
  await db.workSchedule.create({
    data: { name: "Night support", startMinute: 22 * 60, endMinute: 6 * 60, graceMinutes: 10, breakMinutes: 30, halfDayMinutes: 240, workDays: [1, 2, 3, 4, 5] },
  });

  const office = await db.officeLocation.create({
    data: { name: "Bengaluru HQ", address: "80 Feet Rd, Koramangala, Bengaluru 560034", latitude: OFFICE.lat, longitude: OFFICE.lng, radiusMeters: 200, isDefault: true },
  });
  await db.officeLocation.create({
    data: { name: "Pune Studio", address: "Baner Road, Pune 411045", latitude: 18.559, longitude: 73.7868, radiusMeters: 150 },
  });

  const deptDefs = [
    ["Engineering", "ENG", "#4f46e5"],
    ["Product", "PRD", "#0891b2"],
    ["Design", "DES", "#db2777"],
    ["Sales", "SAL", "#ea580c"],
    ["Finance", "FIN", "#16a34a"],
    ["People Ops", "PEO", "#9333ea"],
  ] as const;
  const depts: Record<string, string> = {};
  for (const [name, code, color] of deptDefs) {
    const d = await db.department.create({ data: { name, code, color, description: `${name} team` } });
    depts[code] = d.id;
  }

  const leaveTypes = await Promise.all([
    db.leaveType.create({ data: { name: "Annual Leave", code: "AL", defaultDays: 18, color: "#4f46e5", description: "Planned time off" } }),
    db.leaveType.create({ data: { name: "Sick Leave", code: "SL", defaultDays: 10, color: "#e11d48", description: "Illness or medical appointments" } }),
    db.leaveType.create({ data: { name: "Casual Leave", code: "CL", defaultDays: 6, color: "#0891b2", description: "Short personal matters" } }),
    db.leaveType.create({ data: { name: "Unpaid Leave", code: "UL", defaultDays: 0, isPaid: false, color: "#71717a", description: "Leave without pay" } }),
  ]);

  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const empHash = await bcrypt.hash(EMPLOYEE_PASSWORD, 12);
  const lockedHash = await bcrypt.hash(randomBytes(24).toString("hex"), 12);

  const admin = await db.user.create({
    data: {
      email: "admin@company.com",
      passwordHash: adminHash,
      role: "ADMIN",
      employee: {
        create: {
          employeeCode: "NW-001",
          firstName: "Aisha",
          lastName: "Raman",
          designation: "Head of People",
          joiningDate: dateOnly("2021-04-12"),
          departmentId: depts.PEO,
          workScheduleId: general.id,
          officeLocationId: office.id,
          phone: "+91 98450 11223",
        },
      },
    },
    include: { employee: true },
  });

  const demo = await db.user.create({
    data: {
      email: "employee@company.com",
      passwordHash: empHash,
      role: "EMPLOYEE",
      employee: {
        create: {
          employeeCode: "NW-002",
          firstName: "Rahul",
          lastName: "Verma",
          designation: "Software Engineer",
          joiningDate: dateOnly("2023-07-03"),
          departmentId: depts.ENG,
          managerId: admin.employee!.id,
          workScheduleId: general.id,
          officeLocationId: office.id,
          phone: "+91 99001 22334",
          allowRemote: false,
        },
      },
    },
    include: { employee: true },
  });

  const employees = [
    { ...admin.employee!, hue: 260 },
    { ...demo.employee!, hue: 220 },
  ];
  let n = 3;
  for (const [first, last, dept, title] of PEOPLE) {
    const u = await db.user.create({
      data: {
        email: `${first}.${last}@company.com`.toLowerCase(),
        passwordHash: lockedHash,
        role: "EMPLOYEE",
        employee: {
          create: {
            employeeCode: `NW-${String(n).padStart(3, "0")}`,
            firstName: first,
            lastName: last,
            designation: title,
            joiningDate: dateOnly(`20${pick(["21", "22", "23", "24"])}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-0${1 + Math.floor(rand() * 8)}`),
            departmentId: depts[dept],
            managerId: admin.employee!.id,
            workScheduleId: rand() < 0.15 ? early.id : general.id,
            officeLocationId: office.id,
            status: n === 20 ? "PROBATION" : "ACTIVE",
            allowRemote: rand() < 0.2,
          },
        },
      },
      include: { employee: true },
    });
    employees.push({ ...u.employee!, hue: Math.floor(rand() * 360) });
    n++;
  }
  // Department heads
  await db.department.update({ where: { id: depts.ENG }, data: { headId: employees[2].id } });
  await db.department.update({ where: { id: depts.PRD }, data: { headId: employees[7].id } });
  await db.department.update({ where: { id: depts.PEO }, data: { headId: admin.employee!.id } });

  // Balances
  const year = new Date().getUTCFullYear();
  for (const e of employees) {
    for (const t of leaveTypes) {
      await db.leaveBalance.create({ data: { employeeId: e.id, leaveTypeId: t.id, year, allocated: t.defaultDays } });
    }
  }

  // ─── Leave history ─────────────────────────────────────────────
  const today = localDateString(new Date(), TZ);
  const leaveDays = new Set<string>();
  const leavePlans: { emp: number; offset: number; len: number; type: number; status: "APPROVED" | "PENDING" | "REJECTED" }[] = [
    { emp: 3, offset: -20, len: 2, type: 0, status: "APPROVED" },
    { emp: 5, offset: -12, len: 1, type: 1, status: "APPROVED" },
    { emp: 8, offset: -6, len: 3, type: 0, status: "APPROVED" },
    { emp: 11, offset: 0, len: 2, type: 2, status: "APPROVED" },
    { emp: 14, offset: 0, len: 1, type: 1, status: "APPROVED" },
    { emp: 6, offset: 5, len: 3, type: 0, status: "PENDING" },
    { emp: 1, offset: 9, len: 2, type: 2, status: "PENDING" },
    { emp: 17, offset: 3, len: 1, type: 1, status: "PENDING" },
    { emp: 9, offset: -15, len: 2, type: 0, status: "REJECTED" },
    { emp: 1, offset: -25, len: 1, type: 1, status: "APPROVED" },
  ];
  const reasons = ["Family function out of town", "Fever and doctor's advice to rest", "Personal errands", "Travelling home for a wedding", "Medical appointment"];
  for (const p of leavePlans) {
    const e = employees[p.emp];
    const start = addDays(today, p.offset);
    let s = start;
    while ([6, 7].includes(isoWeekday(s))) s = addDays(s, 1);
    const end = addDays(s, p.len - 1);
    let days = 0;
    for (let d = s; d <= end; d = addDays(d, 1)) if (![6, 7].includes(isoWeekday(d))) days++;
    if (!days) continue;
    await db.leaveRequest.create({
      data: {
        employeeId: e.id,
        leaveTypeId: leaveTypes[p.type].id,
        startDate: dateOnly(s),
        endDate: dateOnly(end),
        days,
        reason: pick(reasons),
        status: p.status,
        reviewerId: p.status !== "PENDING" ? admin.id : null,
        reviewedAt: p.status !== "PENDING" ? new Date() : null,
        reviewComment: p.status === "REJECTED" ? "Quarter-end release week. Please pick other dates." : null,
      },
    });
    if (p.status === "APPROVED") {
      for (let d = s; d <= end; d = addDays(d, 1)) leaveDays.add(`${e.id}:${d}`);
      await db.leaveBalance.update({
        where: { employeeId_leaveTypeId_year: { employeeId: e.id, leaveTypeId: leaveTypes[p.type].id, year } },
        data: { used: { increment: days } },
      });
    }
  }

  // ─── Attendance history (last 42 days) ────────────────────────
  const nowMinute = localMinuteOfDay(new Date(), TZ);
  const scheduleOf = (id: string | null) => (id === early.id ? early : general);
  let created = 0;
  for (let back = 42; back >= 0; back--) {
    const day = addDays(today, -back);
    for (const e of employees) {
      const sched = scheduleOf(e.workScheduleId);
      if (!sched.workDays.includes(isoWeekday(day))) continue;
      if (day < e.joiningDate.toISOString().slice(0, 10)) continue;
      if (leaveDays.has(`${e.id}:${day}`)) continue;
      if (e.id === demo.employee!.id && back === 0) continue; // leave today open for the demo check-in
      if (rand() < 0.06) continue; // absent

      const lateRoll = rand();
      const offset = lateRoll < 0.18 ? between(sched.graceMinutes + 2, 55) : between(-25, sched.graceMinutes - 1);
      const inMinute = Math.round(sched.startMinute + offset);
      if (back === 0 && inMinute > nowMinute) continue; // hasn't arrived yet today
      const checkIn = zonedTimeToUtc(day, inMinute, TZ);

      const isToday = back === 0;
      const stillIn = isToday && rand() < 0.75;
      const workSpan = Math.round(between(sched.endMinute - sched.startMinute - 40, sched.endMinute - sched.startMinute + 55));
      const halfDay = rand() < 0.04;
      const outMinute = inMinute + (halfDay ? Math.round(between(150, 230)) : workSpan);
      let checkOut: Date | null = stillIn ? null : zonedTimeToUtc(day, Math.min(outMinute, 23 * 60 + 50), TZ);
      if (checkOut && checkOut > new Date()) checkOut = null;

      const lateMinutes = Math.max(0, inMinute - sched.startMinute);
      const isLate = lateMinutes > sched.graceMinutes;
      const gross = checkOut ? Math.round((checkOut.getTime() - checkIn.getTime()) / 60000) : null;
      const brk = gross && gross >= 300 ? sched.breakMinutes : 0;
      const worked = gross != null ? Math.max(0, gross - brk) : null;
      const early = checkOut ? Math.max(0, sched.endMinute - Math.min(outMinute, 1430)) : 0;

      // Location: mostly inside the geofence, occasionally noisy.
      const remote = e.allowRemote && rand() < 0.15;
      const lowAcc = rand() < 0.05;
      const jitter = remote ? 0.05 : 0.0012;
      const lat = OFFICE.lat + between(-jitter, jitter);
      const lng = OFFICE.lng + between(-jitter, jitter);
      const accuracy = lowAcc ? between(130, 400) : between(6, 45);
      const distance = Math.round(haversineMeters(lat, lng, OFFICE.lat, OFFICE.lng));
      const within = distance <= office.radiusMeters;
      const flags: string[] = [];
      if (!within) flags.push("OUTSIDE_GEOFENCE");
      if (lowAcc) flags.push("LOW_GPS_ACCURACY");

      let verification: VerificationStatus = flags.length ? (back <= 3 ? "PENDING" : rand() < 0.8 ? "APPROVED" : "REJECTED") : "AUTO_APPROVED";
      if (!within && !e.allowRemote) verification = "PENDING";
      const base: AttendanceStatus = worked != null && worked < sched.halfDayMinutes ? "HALF_DAY" : isLate ? "LATE" : "PRESENT";
      const status: AttendanceStatus = verification === "PENDING" ? "PENDING_VERIFICATION" : verification === "REJECTED" ? "REJECTED" : base;

      const selfie = await saveSelfie(e.id, e.hue, checkIn);
      const att = await db.attendance.create({
        data: {
          employeeId: e.id,
          workDate: dateOnly(day),
          checkInAt: checkIn,
          checkOutAt: checkOut,
          workedMinutes: worked,
          breakMinutes: brk,
          status,
          verificationStatus: verification,
          isLate,
          lateMinutes: isLate ? lateMinutes : 0,
          isEarlyDeparture: early > 0,
          earlyMinutes: early,
          isRemote: !within,
          flags,
          riskScore: flags.length * 25,
          workScheduleId: sched.id,
          scheduleSnapshot: {
            id: sched.id, name: sched.name, startMinute: sched.startMinute, endMinute: sched.endMinute,
            graceMinutes: sched.graceMinutes, breakMinutes: sched.breakMinutes, halfDayMinutes: sched.halfDayMinutes, workDays: sched.workDays,
          },
          officeLocationId: office.id,
          reviewedById: verification === "APPROVED" || verification === "REJECTED" ? admin.id : null,
          reviewedAt: verification === "APPROVED" || verification === "REJECTED" ? new Date(checkIn.getTime() + 86_400_000) : null,
          adminNote: verification === "REJECTED" ? "Location could not be verified." : null,
          createdAt: checkIn,
          evidence: {
            create: {
              type: "CHECK_IN",
              latitude: lat,
              longitude: lng,
              accuracyMeters: Math.round(accuracy * 10) / 10,
              distanceMeters: distance,
              withinGeofence: within,
              selfieUploadId: selfie.id,
              recordedAt: checkIn,
              ipAddress: "10.0.0." + Math.floor(between(2, 250)),
              userAgent: "Mozilla/5.0 (seed)",
            },
          },
        },
      });
      if (checkOut) {
        const olat = OFFICE.lat + between(-0.001, 0.001);
        const olng = OFFICE.lng + between(-0.001, 0.001);
        const od = Math.round(haversineMeters(olat, olng, OFFICE.lat, OFFICE.lng));
        await db.attendanceEvidence.create({
          data: {
            attendanceId: att.id,
            type: "CHECK_OUT",
            latitude: olat,
            longitude: olng,
            accuracyMeters: Math.round(between(8, 40) * 10) / 10,
            distanceMeters: od,
            withinGeofence: od <= office.radiusMeters,
            recordedAt: checkOut,
            ipAddress: "10.0.0." + Math.floor(between(2, 250)),
            userAgent: "Mozilla/5.0 (seed)",
          },
        });
      }
      created++;
    }
  }

  await db.notification.createMany({
    data: [
      { userId: demo.id, type: "ANNOUNCEMENT", title: "Welcome to Attendly", body: "Check in from the dashboard each morning. Your location and a selfie are required." },
      { userId: admin.id, type: "ANNOUNCEMENT", title: "Welcome to Attendly", body: "Review flagged check-ins in Attendance → Verification." },
    ],
  });
  await db.auditLog.create({
    data: { action: "system.seed", entityType: "System", metadata: { employees: employees.length, attendance: created } },
  });

  console.log(`✔ Seeded ${employees.length} employees, ${created} attendance records.`);
  console.log("  Admin:    admin@company.com    /", ADMIN_PASSWORD);
  console.log("  Employee: employee@company.com /", EMPLOYEE_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
