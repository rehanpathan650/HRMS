import { z } from "zod";
import { route } from "@/server/lib/api";
import { ymd } from "@/lib/validators/common";
import { badRequest } from "@/server/lib/errors";
import { addDays } from "@/server/lib/time";
import { audit } from "@/server/lib/audit";
import { REPORT_TYPES, buildReport, toCsv, toXlsx } from "@/server/services/reports";

const query = z.object({
  type: z.enum(REPORT_TYPES),
  from: ymd,
  to: ymd,
  departmentId: z.string().max(40).optional(),
  employeeId: z.string().max(40).optional(),
  format: z.enum(["json", "csv", "xlsx"]).default("json"),
});

export const GET = route({ auth: "ADMIN", query, rateLimit: { limit: 30 } }, async ({ user, query: q }) => {
  if (q.to < q.from) throw badRequest("End date must be after start date");
  if (q.to > addDays(q.from, 366)) throw badRequest("Reports can cover at most one year");
  const report = await buildReport(q.type, q.from, q.to, {
    departmentId: q.departmentId || undefined,
    employeeId: q.employeeId || undefined,
  });
  if (q.format === "json") return report;

  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "report.export",
    entityType: "Report",
    metadata: { type: q.type, from: q.from, to: q.to, format: q.format, rows: report.rows.length },
  });
  const filename = `attendly-${q.type}-${q.from}_${q.to}.${q.format}`;
  if (q.format === "csv") {
    return new Response(toCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }
  const buf = await toXlsx(report);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
