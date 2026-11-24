import { route } from "@/server/lib/api";
import { workScheduleSchema } from "@/lib/validators/org";
import { db } from "@/server/lib/db";
import { audit } from "@/server/lib/audit";
import { scheduleData, serializeSchedule } from "./shared";

export const GET = route({ auth: "ADMIN" }, async () => {
  const list = await db.workSchedule.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { _count: { select: { employees: true } } },
  });
  return list.map((s) => ({ ...serializeSchedule(s), employeeCount: s._count.employees }));
});

export const POST = route({ auth: "ADMIN", body: workScheduleSchema }, async ({ user, body }) => {
  const s = await db.$transaction(async (tx) => {
    if (body.isDefault) await tx.workSchedule.updateMany({ data: { isDefault: false } });
    return tx.workSchedule.create({ data: scheduleData(body) });
  });
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "schedule.create",
    entityType: "WorkSchedule",
    entityId: s.id,
    metadata: { name: s.name },
  });
  return serializeSchedule(s);
});
