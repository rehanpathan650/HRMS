import { redirect } from "next/navigation";
import { getSession } from "@/server/lib/session";

export default async function Home() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  redirect(user.role === "ADMIN" ? "/admin/dashboard" : "/employee/dashboard");
}
