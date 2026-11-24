/**
 * One-time production setup — creates the first admin and company defaults.
 * No demo employees or fake attendance are created.
 *
 *   npm run setup:prod -- --email you@company.com --first Jane --last Doe \
 *       --company "Acme Pvt Ltd" --timezone Asia/Kolkata --app-url https://your-app.vercel.app
 *
 * Reads the database URL from .env.vercel (gitignored). Safe to re-run: existing
 * records are kept; the admin only gets a new password with --reset-password.
 * The admin's password is written to CREDENTIALS.production.local.md (gitignored)
 * and must be changed at first sign-in.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { provisionAccounts, writeCredentialsFile } from "./credentials";

const db = new PrismaClient();

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1]?.trim() : undefined;
}

function fail(msg: string): never {
  console.error(`✘ ${msg}`);
  process.exit(1);
}

async function main() {
  const email = arg("email")?.toLowerCase();
  const first = arg("first") ?? "Admin";
  const last = arg("last") ?? "User";
  const company = arg("company");
  const timezone = arg("timezone");
  const appUrl = arg("app-url") ?? process.env.APP_URL;
  const resetPassword = process.argv.includes("--reset-password");

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Pass a valid --email for the admin account.");
  if (timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      fail(`Unknown --timezone "${timezone}". Example: Asia/Kolkata`);
    }
  }

  try {
    await db.systemSetting.count();
  } catch {
    fail("Database tables not found. Deploy once on Vercel (it runs migrations) or run `prisma migrate deploy` first.");
  }

  // Company settings
  await db.systemSetting.upsert({
    where: { id: "default" },
    update: { ...(company ? { companyName: company } : {}), ...(timezone ? { timezone } : {}) },
    create: { id: "default", companyName: company ?? "My Company", timezone: timezone ?? "Asia/Kolkata" },
  });

  // Default shift (09:30–18:30, Mon–Fri) if none exists — edit in Settings → Shifts.
  if ((await db.workSchedule.count()) === 0) {
    await db.workSchedule.create({
      data: { name: "General shift", startMinute: 570, endMinute: 1110, graceMinutes: 15, breakMinutes: 60, halfDayMinutes: 240, workDays: [1, 2, 3, 4, 5], isDefault: true },
    });
    console.log("  + Default shift: 09:30–18:30, Mon–Fri");
  }

  // Leave types if none exist — edit in Leave → Leave types.
  if ((await db.leaveType.count()) === 0) {
    await db.leaveType.createMany({
      data: [
        { name: "Annual Leave", code: "AL", defaultDays: 18, color: "#4f46e5", description: "Planned time off" },
        { name: "Sick Leave", code: "SL", defaultDays: 10, color: "#e11d48", description: "Illness or medical appointments" },
        { name: "Casual Leave", code: "CL", defaultDays: 6, color: "#0891b2", description: "Short personal matters" },
        { name: "Unpaid Leave", code: "UL", defaultDays: 0, isPaid: false, color: "#71717a", description: "Leave without pay" },
      ],
    });
    console.log("  + Leave types: Annual 18, Sick 10, Casual 6, Unpaid");
  }

  // Admin account
  const existing = await db.user.findUnique({ where: { email } });
  if (!existing) {
    await db.user.create({
      data: {
        email,
        role: "ADMIN",
        passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 12),
        employee: {
          create: {
            employeeCode: "ADM-001",
            firstName: first,
            lastName: last,
            designation: "Administrator",
            joiningDate: new Date(new Date().toISOString().slice(0, 10)),
          },
        },
      },
    });
    console.log(`  + Admin account: ${email}`);
  } else if (existing.role !== "ADMIN") {
    fail(`${email} exists but is not an admin. Use a different email.`);
  } else if (!resetPassword) {
    console.log(`  = Admin ${email} already exists (password unchanged; pass --reset-password to issue a new one).`);
    return;
  }

  const issued = await provisionAccounts(db, [email], { forcePasswordChange: true });
  const file = await writeCredentialsFile(issued, path.resolve("CREDENTIALS.production.local.md"), appUrl);
  console.log(`✔ Admin password written to ${file} (gitignored). It must be changed at first sign-in.`);

  if ((await db.officeLocation.count()) === 0) {
    console.log("  ! No office location yet: sign in and add one under Settings → Offices before employees check in.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
