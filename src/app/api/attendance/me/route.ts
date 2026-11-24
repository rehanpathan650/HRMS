import { z } from "zod";
import { route } from "@/server/lib/api";
import { ymd } from "@/lib/validators/common";
import { badRequest } from "@/server/lib/errors";
import { employeeSummary } from "@/server/services/analytics";
import { addDays } from "@/server/lib/time";

const query = z.object({ from: ymd, to: ymd });

/** Own attendance calendar + totals for a date range (max 366 days). */
export const GET = route({ auth: "EMPLOYEE", query }, async ({ user, query }) => {
  if (query.to < query.from) throw badRequest("`to` must be after `from`");
  if (query.to > addDays(query.from, 366)) throw badRequest("Range too large");
  return employeeSummary(user.employee!.id, query.from, query.to);
});
