import { route, withIdempotency } from "@/server/lib/api";
import { checkOutSchema } from "@/lib/validators/attendance";
import { checkOut } from "@/server/services/attendance";

export const POST = route(
  { auth: "EMPLOYEE", body: checkOutSchema, rateLimit: { limit: 10, key: "attendance:check-out" } },
  async ({ req, user, body, ip, userAgent }) =>
    withIdempotency(user.id, "attendance.check-out", req.headers.get("idempotency-key"), () =>
      checkOut(user, body, { ip, userAgent }),
    ),
);
