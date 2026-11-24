/**
 * Shared credential provisioning used by the seed and `npm run accounts:provision`.
 *
 * Generates strong random passwords, stores only bcrypt hashes in the database,
 * revokes existing sessions for those accounts, and writes the plaintext ONCE to
 * CREDENTIALS.local.md (gitignored). Plaintext passwords never go to logs,
 * the audit log or source code.
 */
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const CREDENTIALS_FILE = path.resolve(process.cwd(), "CREDENTIALS.local.md");

/** Accounts that get a known password. Everyone else keeps an unusable random one. */
export const DEFAULT_ACCOUNTS = [
  "admin@company.com",
  "employee@company.com",
  "arjun.mehta@company.com",
  "priya.nair@company.com",
  "ananya.reddy@company.com",
  "divya.menon@company.com",
  "nikhil.chopra@company.com",
];

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT = "23456789";
const SYMBOL = "!@#$%^&*-_+=?";

/** 18-char password from a CSPRNG; always satisfies the app's password policy. */
export function generatePassword(length = 18) {
  const all = LOWER + UPPER + DIGIT + SYMBOL;
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export interface IssuedCredential {
  email: string;
  password: string;
  role: string;
  name: string;
  designation: string;
}

export async function provisionAccounts(
  db: PrismaClient,
  emails: string[],
  opts: { forcePasswordChange?: boolean } = {},
) {
  const issued: IssuedCredential[] = [];
  for (const email of emails) {
    const user = await db.user.findUnique({ where: { email }, include: { employee: true } });
    if (!user) {
      console.warn(`  ! ${email} not found, skipped`);
      continue;
    }
    const password = generatePassword();
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(password, 12),
        isActive: true,
        mustChangePassword: opts.forcePasswordChange ?? false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        passwordChangedAt: new Date(),
      },
    });
    await db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await db.auditLog.create({
      data: { actorEmail: "system", action: "auth.password_provisioned", entityType: "User", entityId: user.id, metadata: { email } },
    });
    issued.push({
      email,
      password,
      role: user.role,
      name: user.employee ? `${user.employee.firstName} ${user.employee.lastName}` : email,
      designation: user.employee?.designation ?? "",
    });
  }
  return issued;
}

export async function writeCredentialsFile(issued: IssuedCredential[], file = CREDENTIALS_FILE, appUrlOverride?: string) {
  const appUrl = appUrlOverride || process.env.APP_URL || "http://localhost:3000";
  const rows = issued
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "ADMIN" ? -1 : 1))
    .map((c) => `| ${c.role === "ADMIN" ? "Admin" : "Employee"} | ${c.name} | ${c.designation} | \`${c.email}\` | \`${c.password}\` |`)
    .join("\n");
  const content = `# Attendly — login credentials (CONFIDENTIAL)

> Generated ${new Date().toISOString()} by \`${process.argv[1] ? path.basename(process.argv[1]) : "script"}\`.
> This file is **gitignored** and must never be committed, pasted into chat or emailed in plain text.
> Share each password with its owner through a password manager, then delete this file.

Sign in at: ${appUrl}/login

| Role | Name | Designation | Email | Password |
| ---- | ---- | ----------- | ----- | -------- |
${rows}

## Notes

- Only bcrypt hashes are stored in the database; this file is the only copy of the plaintext.
- Running \`npm run accounts:provision\` again **rotates** these passwords (old ones stop working,
  existing sessions are signed out) and rewrites this file.
- All other seeded employees have unusable random passwords. Give one a login with
  \`npm run accounts:provision -- someone@company.com\`, or use Admin → Employees → Reset password.
- Before real use, each person should change their password under Settings → Password.
`;
  await fs.writeFile(file, content, { encoding: "utf8", mode: 0o600 });
  return file;
}
