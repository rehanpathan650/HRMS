import "server-only";
import bcrypt from "bcryptjs";

const COST = 12;
export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Used to equalize timing when the user does not exist.
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.8C0rRvCq8ZbYdP3vB1C0yJYd7S0K";
export const fakeVerify = (plain: string) => bcrypt.compare(plain, DUMMY_HASH).catch(() => false);
