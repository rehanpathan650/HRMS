import { readFormLimited, route } from "@/server/lib/api";
import { db } from "@/server/lib/db";
import { ApiError, badRequest } from "@/server/lib/errors";
import { extFor, sniffImageType, storage } from "@/server/lib/storage";
import { randomToken } from "@/server/lib/crypto";
import { MAX_AVATAR_BYTES } from "@/lib/constants";
import { signedAvatar } from "@/server/services/employees";

export const POST = route({ auth: "EMPLOYEE", rateLimit: { limit: 10, key: "me:avatar" } }, async ({ req, user }) => {
  const form = await readFormLimited(req, MAX_AVATAR_BYTES + 64 * 1024).catch((e) => {
    if (e instanceof ApiError && e.status === 413) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Image must be under 2 MB.");
    throw e;
  });
  const file = form.get("avatar");
  if (!(file instanceof File)) throw badRequest("Missing image");
  if (file.size > MAX_AVATAR_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Image must be under 2 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffImageType(buf);
  if (!mime) throw badRequest("Use a JPEG, PNG or WebP image.");

  const employee = await db.employee.findUniqueOrThrow({ where: { id: user.employee!.id } });
  const key = `avatars/${employee.id}/${randomToken(12)}.${extFor(mime)}`;
  await storage().put(key, buf, mime);
  await db.employee.update({ where: { id: employee.id }, data: { avatarKey: key } });
  if (employee.avatarKey) await storage().delete(employee.avatarKey).catch(() => {});
  return { avatarUrl: await signedAvatar(key) };
});
