import { route, withIdempotency } from "@/server/lib/api";
import { checkInSchema } from "@/lib/validators/attendance";
import { checkIn } from "@/server/services/attendance";

export const POST = route(
  { auth: "EMPLOYEE", body: checkInSchema, rateLimit: { limit: 10, key: "attendance:check-in" } },
  async ({ req, user, body, ip, userAgent }) =>
    withIdempotency(user.id, "attendance.check-in", req.headers.get("idempotency-key"), () =>
      checkIn(user, body, { ip, userAgent }),
    ),
);
