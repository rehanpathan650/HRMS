import { z } from "zod";
import { route } from "@/server/lib/api";
import { adminOverview, recentActivity } from "@/server/services/analytics";

const query = z.object({
  days: z.coerce.number().int().min(7).max(90).default(14),
  departmentId: z.string().max(40).optional(),
});

export const GET = route({ auth: "ADMIN", query }, async ({ query }) => {
  const [overview, activity] = await Promise.all([
    adminOverview({ days: query.days, departmentId: query.departmentId || undefined }),
    recentActivity(8),
  ]);
  return { ...overview, activity };
});
