import { redirect } from "next/navigation";
import { getSession } from "@/server/lib/session";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login?next=/employee/dashboard");
  if (user.mustChangePassword) redirect("/change-password");
  if (!user.employee) redirect("/admin/dashboard");
  return <AppShell area="employee">{children}</AppShell>;
}
