"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { PasswordStrength } from "@/components/shared/password-strength";
import { resetPasswordSchema } from "@/lib/validators/auth";
import { api, errorMessage } from "@/lib/api-client";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const form = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "", confirmPassword: "" },
  });
  const pw = form.watch("password");

  if (!token) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invalid link</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">This reset link is missing its token.</p>
        <Button asChild className="mt-6">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await api.post("/auth/reset-password", v);
      toast.success("Password updated. Sign in with your new password.");
      router.replace("/login");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">All other sessions will be signed out.</p>
      <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
        <Field label="New password" htmlFor="password" error={form.formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
        </Field>
        <PasswordStrength value={pw} />
        <Field label="Confirm password" htmlFor="confirm" error={form.formState.errors.confirmPassword?.message}>
          <Input id="confirm" type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
        </Field>
        <Button type="submit" className="h-10" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <LoaderCircle className="animate-spin" />}
          Update password
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
