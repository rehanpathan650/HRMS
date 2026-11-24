import { readFormLimited, route } from "@/server/lib/api";
import { db } from "@/server/lib/db";
import { ApiError, badRequest } from "@/server/lib/errors";
import { extFor, sniffImageType, storage } from "@/server/lib/storage";
import { randomToken, sha256 } from "@/server/lib/crypto";
import { MAX_SELFIE_BYTES } from "@/lib/constants";

/**
 * Accepts a selfie captured by the in-app camera. Returns a single-use upload id
 * that must be attached to a check-in / check-out within 10 minutes.
 */
export const POST = route(
  { auth: "EMPLOYEE", rateLimit: { limit: 12, key: "attendance:selfie" } },
  async ({ req, user }) => {
    const form = await readFormLimited(req, MAX_SELFIE_BYTES + 64 * 1024).catch((e) => {
      if (e instanceof ApiError && e.status === 413) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Selfie must be under 3 MB.");
      throw e;
    });
    const file = form.get("selfie");
    if (!(file instanceof File)) throw badRequest("Missing selfie image");
    if (file.size === 0) throw badRequest("Selfie image is empty");
    if (file.size > MAX_SELFIE_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Selfie must be under 3 MB.");

    const buf = Buffer.from(await file.arrayBuffer());
    const mime = sniffImageType(buf);
    if (!mime) throw badRequest("Selfie must be a JPEG, PNG or WebP image.");

    const employeeId = user.employee!.id;
    const now = new Date();
    const key = `selfies/${employeeId}/${now.toISOString().slice(0, 7)}/${randomToken(18)}.${extFor(mime)}`;
    await storage().put(key, buf, mime);
    const upload = await db.selfieUpload.create({
      data: { employeeId, storageKey: key, mimeType: mime, sizeBytes: buf.length, sha256: sha256(buf) },
    });
    return { uploadId: upload.id, expiresInSeconds: 600 };
  },
);
