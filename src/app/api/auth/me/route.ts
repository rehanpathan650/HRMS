import { route } from "@/server/lib/api";
import { signedAvatar } from "@/server/services/employees";
import { getSettings } from "@/server/services/settings";

export const GET = route({ auth: "ANY", allowPasswordChangePending: true }, async ({ user }) => {
  const settings = await getSettings();
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    company: { name: settings.companyName, timezone: settings.timezone },
    employee: user.employee
      ? {
          id: user.employee.id,
          name: `${user.employee.firstName} ${user.employee.lastName}`,
          firstName: user.employee.firstName,
          employeeCode: user.employee.employeeCode,
          designation: user.employee.designation,
          avatarUrl: await signedAvatar(user.employee.avatarKey),
        }
      : null,
  };
});
