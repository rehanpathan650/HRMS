import { route } from "@/server/lib/api";
import { reviewAttendanceSchema } from "@/lib/validators/attendance";
import { reviewAttendance } from "@/server/services/attendance";

export const POST = route({ auth: "ADMIN", body: reviewAttendanceSchema }, async ({ user, params, body }) =>
  reviewAttendance(user, params.id, body.decision, body.note),
);
