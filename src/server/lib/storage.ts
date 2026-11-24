import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "./env";
import { hmac, safeEqual } from "./crypto";

export interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, ttlSeconds?: number): Promise<string>;
}

const KEY_RE = /^[a-z0-9][a-z0-9/_.-]{3,200}$/i;
function assertKey(key: string) {
  if (!KEY_RE.test(key) || key.includes("..")) throw new Error("Invalid storage key");
}

/** Private local disk storage. Files are served only via HMAC-signed, expiring URLs. */
class LocalStorage implements StorageProvider {
  private root = path.resolve(env().STORAGE_LOCAL_DIR);
  private resolve(key: string) {
    assertKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage path");
    return full;
  }
  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data, { mode: 0o600 });
  }
  async get(key: string) {
    try {
      return await fs.readFile(this.resolve(key));
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
  async signedUrl(key: string, ttlSeconds = 300) {
    assertKey(key);
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = hmac(`${key}:${exp}`);
    return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}?exp=${exp}&sig=${sig}`;
  }
}

/** S3-compatible storage (AWS S3, R2, MinIO). Bucket must be private. */
class S3Storage implements StorageProvider {
  private clientPromise = (async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const e = env();
    if (!e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) {
      throw new Error("S3 storage selected but S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are missing");
    }
    return new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT || undefined,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
    });
  })();
  private bucket = () => env().S3_BUCKET!;

  async put(key: string, data: Buffer, contentType: string) {
    assertKey(key);
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const c = await this.clientPromise;
    await c.send(
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: key,
        Body: data,
        ContentType: contentType,
        ServerSideEncryption: env().S3_ENDPOINT ? undefined : "AES256",
      }),
    );
  }
  async get(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const c = await this.clientPromise;
    try {
      const res = await c.send(new GetObjectCommand({ Bucket: this.bucket(), Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const c = await this.clientPromise;
    await c.send(new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }));
  }
  async signedUrl(key: string, ttlSeconds = 300) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const c = await this.clientPromise;
    return getSignedUrl(c, new GetObjectCommand({ Bucket: this.bucket(), Key: key }), { expiresIn: ttlSeconds });
  }
}

let provider: StorageProvider | null = null;
export function storage(): StorageProvider {
  if (!provider) provider = env().STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage();
  return provider;
}

export function verifyLocalSignature(key: string, exp: string | null, sig: string | null) {
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(hmac(`${key}:${exp}`), sig);
}

/** Detects the real image type from magic bytes. Never trust the client's Content-Type. */
export function sniffImageType(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return "image/webp";
  return null;
}

export const extFor = (mime: string) => (mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg");
