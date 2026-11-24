import "server-only";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const COST = 12;
export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// A real cost-12 hash of a random secret, generated once per process, so checks
// for unknown or locked accounts take the same time as a real password check.
let dummyHash: Promise<string> | null = null;
export const fakeVerify = async (plain: string) => {
  dummyHash ??= bcrypt.hash(randomBytes(24).toString("hex"), COST);
  return bcrypt.compare(plain, await dummyHash).catch(() => false);
};
