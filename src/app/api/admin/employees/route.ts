import { z } from "zod";
import { route } from "@/server/lib/api";
import { pagination } from "@/lib/validators/common";
import { createEmployeeSchema } from "@/lib/validators/employee";
import { createEmployee, listEmployees } from "@/server/services/employees";

const query = pagination.extend({
  search: z.string().trim().max(100).optional(),
  departmentId: z.string().max(40).optional(),
  status: z.enum(["ACTIVE", "PROBATION", "NOTICE", "INACTIVE", "TERMINATED"]).optional(),
  sort: z.enum(["name", "joiningDate", "employeeCode", "department", "designation"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

export const GET = route({ auth: "ADMIN", query }, async ({ query }) =>
  listEmployees({ ...query, departmentId: query.departmentId || undefined }),
);

export const POST = route({ auth: "ADMIN", body: createEmployeeSchema }, async ({ user, body }) =>
  createEmployee(user, body),
);
