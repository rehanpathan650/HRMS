import { route } from "@/server/lib/api";
import { reviewLeaveSchema } from "@/lib/validators/leave";
import { reviewLeave } from "@/server/services/leave";

export const POST = route({ auth: "ADMIN", body: reviewLeaveSchema }, async ({ user, params, body }) =>
  reviewLeave(user, params.id, body.decision, body.comment),
);
