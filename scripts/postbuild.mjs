// Copies static assets into Next's standalone output so `npm start` can serve them.
// (Next intentionally leaves .next/static and public/ out of .next/standalone.)
import { cpSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
if (!existsSync(standalone)) {
  console.warn("postbuild: .next/standalone not found (is output: 'standalone' set?) — skipping");
  process.exit(0);
}
cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) {
  cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
}
console.log("postbuild: static assets copied into .next/standalone");
