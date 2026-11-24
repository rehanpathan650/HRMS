import { z } from "zod";
import { route } from "@/server/lib/api";
import { ymd } from "@/lib/validators/common";
import { badRequest, notFound } from "@/server/lib/errors";
import { addDays } from "@/server/lib/time";
import { employeeSummary } from "@/server/services/analytics";
import { getBalances } from "@/server/services/leave";

const query = z.object({ from: ymd, to: ymd });

export const GET = route({ auth: "ADMIN", query }, async ({ params, query }) => {
  if (query.to < query.from || query.to > addDays(query.from, 366)) throw badRequest("Invalid range");
  const summary = await employeeSummary(params.id, query.from, query.to);
  if (!summary) throw notFound("Employee not found");
  const balances = await getBalances(params.id, Number(query.to.slice(0, 4)));
  return { ...summary, balances };
});
