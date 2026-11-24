import { route } from "@/server/lib/api";
import { db } from "@/server/lib/db";

/** Small reference lists used by admin forms and filters. */
export const GET = route({ auth: "ADMIN" }, async () => {
  const [departments, schedules, offices, employees, leaveTypes] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
    db.workSchedule.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, isDefault: true } }),
    db.officeLocation.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, isDefault: true } }),
    db.employee.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeCode: true, status: true },
    }),
    db.leaveType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true, isActive: true } }),
  ]);
  return {
    departments,
    schedules,
    offices,
    leaveTypes,
    employees: employees.map((e) => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      employeeCode: e.employeeCode,
      status: e.status,
    })),
  };
});
