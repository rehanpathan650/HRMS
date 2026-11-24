import { route } from "@/server/lib/api";
import { updateEmployeeSchema } from "@/lib/validators/employee";
import { deleteEmployee, getEmployee, updateEmployee } from "@/server/services/employees";

export const GET = route({ auth: "ADMIN" }, async ({ params }) => getEmployee(params.id));

export const PATCH = route({ auth: "ADMIN", body: updateEmployeeSchema }, async ({ user, params, body }) =>
  updateEmployee(user, params.id, body),
);

export const DELETE = route({ auth: "ADMIN" }, async ({ user, params }) => {
  await deleteEmployee(user, params.id);
  return { ok: true };
});
