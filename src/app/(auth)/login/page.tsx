import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/server/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSession();
  if (user) redirect(user.mustChangePassword ? "/change-password" : user.role === "ADMIN" ? "/admin/dashboard" : "/employee/dashboard");
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
