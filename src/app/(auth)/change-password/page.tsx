import { redirect } from "next/navigation";
import { getSession } from "@/server/lib/session";
import { ForcedChange } from "./forced-change";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  return <ForcedChange target={user.role === "ADMIN" ? "/admin/dashboard" : "/employee/dashboard"} forced={user.mustChangePassword} />;
}
