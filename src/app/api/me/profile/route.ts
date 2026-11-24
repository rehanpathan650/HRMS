import { route } from "@/server/lib/api";
import { selfProfileSchema } from "@/lib/validators/employee";
import { db } from "@/server/lib/db";
import { audit } from "@/server/lib/audit";
import { dateOnly } from "@/server/lib/time";
import { getEmployee } from "@/server/services/employees";

export const GET = route({ auth: "EMPLOYEE" }, async ({ user }) => getEmployee(user.employee!.id));

/** Employees may only edit a small whitelist of personal fields. */
export const PATCH = route({ auth: "EMPLOYEE", body: selfProfileSchema }, async ({ user, body }) => {
  await db.employee.update({
    where: { id: user.employee!.id },
    data: {
      phone: body.phone,
      address: body.address,
      emergencyContact: body.emergencyContact,
      dateOfBirth: body.dateOfBirth ? dateOnly(body.dateOfBirth) : null,
    },
  });
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "profile.update",
    entityType: "Employee",
    entityId: user.employee!.id,
    metadata: { fields: Object.keys(body) },
  });
  return getEmployee(user.employee!.id);
});
