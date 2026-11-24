"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { PasswordStrength } from "@/components/shared/password-strength";
import { changePasswordSchema } from "@/lib/validators/auth";
import { api, errorMessage } from "@/lib/api-client";

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const form = useForm<z.infer<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const pw = form.watch("newPassword");
  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await api.post("/auth/change-password", v);
      toast.success("Password changed. Other sessions were signed out.");
      form.reset();
      onDone?.();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <Field label="Current password" htmlFor="cur" error={form.formState.errors.currentPassword?.message}>
        <Input id="cur" type="password" autoComplete="current-password" {...form.register("currentPassword")} />
      </Field>
      <Field label="New password" htmlFor="new" error={form.formState.errors.newPassword?.message}>
        <Input id="new" type="password" autoComplete="new-password" {...form.register("newPassword")} />
      </Field>
      <PasswordStrength value={pw} />
      <Field label="Confirm new password" htmlFor="conf" error={form.formState.errors.confirmPassword?.message}>
        <Input id="conf" type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
      </Field>
      <div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <LoaderCircle className="animate-spin" />}
          Update password
        </Button>
      </div>
    </form>
  );
}
