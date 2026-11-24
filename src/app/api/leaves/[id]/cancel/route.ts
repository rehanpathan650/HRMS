import { route } from "@/server/lib/api";
import { cancelLeave } from "@/server/services/leave";

export const POST = route({ auth: "EMPLOYEE" }, async ({ user, params }) => {
  await cancelLeave(user, params.id);
  return { ok: true };
});
