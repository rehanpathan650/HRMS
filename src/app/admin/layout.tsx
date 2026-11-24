import { redirect } from "next/navigation";
import { getSession } from "@/server/lib/session";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login?next=/admin/dashboard");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "ADMIN") redirect("/employee/dashboard");
  return <AppShell area="admin">{children}</AppShell>;
}
