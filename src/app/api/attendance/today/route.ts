import { route } from "@/server/lib/api";
import { getTodayState } from "@/server/services/attendance";

export const GET = route({ auth: "EMPLOYEE" }, async ({ user }) => getTodayState(user.employee!.id));
