import { route } from "@/server/lib/api";
import { resetEmployeePassword } from "@/server/services/employees";

export const POST = route({ auth: "ADMIN", rateLimit: { limit: 10 } }, async ({ user, params }) =>
  resetEmployeePassword(user, params.id),
);
