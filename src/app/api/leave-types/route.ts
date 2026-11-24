import { route } from "@/server/lib/api";
import { db } from "@/server/lib/db";

export const GET = route({ auth: "ANY" }, async () =>
  db.leaveType.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, color: true, isPaid: true, description: true, defaultDays: true },
  }),
);
