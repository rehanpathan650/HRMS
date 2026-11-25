/**
 * Issues a new password for one or more accounts, clears any lockout, and
 * updates their rows in CREDENTIALS.production.local.md (other rows untouched).
 *
 *   npx tsx --env-file=.env.vercel scripts/reset-password.ts admin@company.com
 *
 * Add --force-change to make the person choose a new password at next sign-in.
 */
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { provisionAccounts } from "./credentials";

const db = new PrismaClient();
const FILE = path.resolve("CREDENTIALS.production.local.md");

async function main() {
  const emails = process.argv.slice(2).filter((a) => a.includes("@")).map((e) => e.toLowerCase());
  if (!emails.length) throw new Error("Pass at least one email.");
  const issued = await provisionAccounts(db, emails, { forcePasswordChange: process.argv.includes("--force-change") });

  let content = await fs.readFile(FILE, "utf8").catch(() => "");
  for (const c of issued) {
    const row = `| ${c.role === "ADMIN" ? "Admin" : "Employee"} | ${c.name} | ${c.designation} | \`${c.email}\` | \`${c.password}\` |`;
    // Tolerates tables re-aligned by an editor (extra padding spaces).
    const re = new RegExp(`^\\|.*\\|\\s*\`${c.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\`\\s*\\|.*$`, "m");
    content = re.test(content) ? content.replace(re, row) : `${content.trimEnd()}\n${row}\n`;
    console.log(`  ✔ ${c.email}: new password issued, lockout cleared, other sessions signed out`);
  }
  await fs.writeFile(FILE, content, { encoding: "utf8", mode: 0o600 });
  console.log(`Updated ${FILE} (gitignored).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
