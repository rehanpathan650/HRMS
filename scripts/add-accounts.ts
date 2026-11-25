/**
 * Adds starter employee accounts to a deployed database and appends their
 * one-time passwords to CREDENTIALS.production.local.md (gitignored).
 *
 *   npx tsx --env-file=.env.vercel scripts/add-accounts.ts
 *
 * Idempotent: existing emails are skipped. Every account must change its
 * password at first sign-in. Edit the PEOPLE list to suit your team.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { provisionAccounts, type IssuedCredential } from "./credentials";

const db = new PrismaClient();
const FILE = path.resolve("CREDENTIALS.production.local.md");

const DEPARTMENTS = [
  { name: "Engineering", code: "ENG", color: "#4f46e5" },
  { name: "Sales", code: "SAL", color: "#ea580c" },
  { name: "Human Resources", code: "HR", color: "#9333ea" },
];

const PEOPLE = [
  { email: "rahul.verma@company.com", first: "Rahul", last: "Verma", title: "Software Engineer", dept: "ENG", role: "EMPLOYEE" },
  { email: "priya.nair@company.com", first: "Priya", last: "Nair", title: "Frontend Engineer", dept: "ENG", role: "EMPLOYEE" },
  { email: "arjun.mehta@company.com", first: "Arjun", last: "Mehta", title: "Engineering Lead", dept: "ENG", role: "EMPLOYEE" },
  { email: "divya.menon@company.com", first: "Divya", last: "Menon", title: "Account Executive", dept: "SAL", role: "EMPLOYEE" },
  { email: "aman.gupta@company.com", first: "Aman", last: "Gupta", title: "Sales Associate", dept: "SAL", role: "EMPLOYEE" },
  { email: "neha.saxena@company.com", first: "Neha", last: "Saxena", title: "HR Manager", dept: "HR", role: "ADMIN" },
] as const;

async function main() {
  const deptIds: Record<string, string> = {};
  for (const d of DEPARTMENTS) {
    const dept = await db.department.upsert({ where: { code: d.code }, update: {}, create: d });
    deptIds[d.code] = dept.id;
  }
  const schedule = await db.workSchedule.findFirst({ where: { isDefault: true } });
  const office = await db.officeLocation.findFirst({ where: { isDefault: true } });
  const manager = await db.employee.findFirst({ where: { user: { email: "admin@company.com" } } });
  const existingCount = await db.employee.count();

  const created: string[] = [];
  let n = existingCount + 1;
  for (const p of PEOPLE) {
    if (await db.user.findUnique({ where: { email: p.email } })) {
      console.log(`  = ${p.email} already exists, skipped`);
      continue;
    }
    let code = `EMP-${String(n).padStart(3, "0")}`;
    while (await db.employee.findUnique({ where: { employeeCode: code } })) code = `EMP-${String(++n).padStart(3, "0")}`;
    n++;
    await db.user.create({
      data: {
        email: p.email,
        role: p.role,
        passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 12),
        employee: {
          create: {
            employeeCode: code,
            firstName: p.first,
            lastName: p.last,
            designation: p.title,
            joiningDate: new Date(new Date().toISOString().slice(0, 10)),
            departmentId: deptIds[p.dept],
            managerId: manager?.id ?? null,
            workScheduleId: schedule?.id ?? null,
            officeLocationId: office?.id ?? null,
          },
        },
      },
    });
    created.push(p.email);
    console.log(`  + ${p.email} (${p.role === "ADMIN" ? "Admin" : "Employee"}, ${code})`);
  }

  if (!created.length) {
    console.log("No new accounts created.");
    return;
  }
  const issued = await provisionAccounts(db, created, { forcePasswordChange: true });
  await appendToFile(issued);
  console.log(`✔ ${issued.length} passwords added to ${FILE} (gitignored). Each must be changed at first sign-in.`);
}

async function appendToFile(issued: IssuedCredential[]) {
  const rows = issued
    .map((c) => `| ${c.role === "ADMIN" ? "Admin" : "Employee"} | ${c.name} | ${c.designation} | \`${c.email}\` | \`${c.password}\` |`)
    .join("\n");
  let content: string;
  try {
    content = await fs.readFile(FILE, "utf8");
  } catch {
    content = "# Attendly — login credentials (CONFIDENTIAL)\n\n| Role | Name | Designation | Email | Password |\n| ---- | ---- | ----------- | ----- | -------- |\n\n## Notes\n";
  }
  // Insert the new rows at the end of the existing credentials table.
  const lines = content.split("\n");
  let last = -1;
  lines.forEach((l, i) => {
    if (l.startsWith("| ")) last = i;
  });
  if (last === -1) content += `\n${rows}\n`;
  else {
    lines.splice(last + 1, 0, rows);
    content = lines.join("\n");
  }
  await fs.writeFile(FILE, content, { encoding: "utf8", mode: 0o600 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
