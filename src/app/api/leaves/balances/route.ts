import { z } from "zod";
import { route } from "@/server/lib/api";
import { getBalances } from "@/server/services/leave";

const query = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });

export const GET = route({ auth: "EMPLOYEE", query }, async ({ user, query }) =>
  getBalances(user.employee!.id, query.year ?? new Date().getUTCFullYear()),
);
