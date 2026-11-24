import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional().transform((v) => (v ? v : undefined)),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  DEV_EXPOSE_RESET_LINK: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

type Env = z.infer<typeof schema>;
let cached: Env | null = null;

/** Lazily validated environment. Throws a readable error on misconfiguration. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  if (parsed.data.NODE_ENV === "production" && /replace-with|change-me/i.test(parsed.data.APP_SECRET)) {
    throw new Error("Invalid environment configuration — APP_SECRET is still a placeholder");
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";
