// Starts the production (standalone) server built by `npm run build`.
//
//  - loads .env (Node's built-in loader; nothing is printed)
//  - forces NODE_ENV=production
//  - binds to 127.0.0.1 unless BIND_HOST is set (e.g. BIND_HOST=0.0.0.0 behind a proxy)
//  - pins STORAGE_LOCAL_DIR to an absolute path, because the standalone server
//    changes its working directory on start
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const server = path.join(root, ".next", "standalone", "server.js");
if (!existsSync(server)) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}

if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
process.env.NODE_ENV = "production";
process.env.HOSTNAME = process.env.BIND_HOST || "127.0.0.1";
process.env.PORT = process.env.PORT || "3000";
process.env.STORAGE_LOCAL_DIR = path.resolve(root, process.env.STORAGE_LOCAL_DIR || "storage");

if (!process.env.APP_SECRET || process.env.APP_SECRET.length < 32 || /replace-with/.test(process.env.APP_SECRET)) {
  console.error("APP_SECRET is missing or still the placeholder. Set a long random value in .env.");
  process.exit(1);
}

await import(pathToFileURL(server).href);
