import { route } from "@/server/lib/api";
import { departmentSchema } from "@/lib/validators/org";
import { db } from "@/server/lib/db";
import { audit } from "@/server/lib/audit";

export const GET = route({ auth: "ADMIN" }, async () => {
  const depts = await db.department.findMany({
    orderBy: { name: "asc" },
    include: {
      head: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { employees: true } },
    },
  });
  return depts.map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    description: d.description,
    color: d.color,
    head: d.head ? { id: d.head.id, name: `${d.head.firstName} ${d.head.lastName}` } : null,
    employeeCount: d._count.employees,
    createdAt: d.createdAt.toISOString(),
  }));
});

export const POST = route({ auth: "ADMIN", body: departmentSchema }, async ({ user, body }) => {
  const d = await db.department.create({ data: body });
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "department.create",
    entityType: "Department",
    entityId: d.id,
    metadata: { name: d.name },
  });
  return d;
});
