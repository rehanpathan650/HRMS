/**
 * Issues fresh, strong passwords for login accounts and writes them to
 * CREDENTIALS.local.md (gitignored).
 *
 *   npm run accounts:provision                      # default demo accounts
 *   npm run accounts:provision -- a@x.com b@x.com   # specific accounts
 *
 * Safe for production: it only changes the listed accounts and never prints passwords.
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_ACCOUNTS, provisionAccounts, writeCredentialsFile } from "./credentials";

const db = new PrismaClient();

async function main() {
  const emails = process.argv.slice(2).filter((a) => a.includes("@")).map((e) => e.toLowerCase());
  const targets = emails.length ? emails : DEFAULT_ACCOUNTS;
  const issued = await provisionAccounts(db, targets);
  if (!issued.length) {
    console.error("No accounts were updated.");
    process.exit(1);
  }
  const file = await writeCredentialsFile(issued);
  console.log(`✔ Issued new passwords for ${issued.length} account(s). Existing sessions were signed out.`);
  console.log(`  Credentials written to ${file} (gitignored). Passwords are not printed here.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
