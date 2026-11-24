"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, LoaderCircle, Mail } from "lucide-react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { forgotPasswordSchema } from "@/lib/validators/auth";
import { api, errorMessage } from "@/lib/api-client";
import { toast } from "sonner";
import { FadeIn } from "@/components/shared/motion";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState<{ message: string; devResetLink?: string } | null>(null);
  const form = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      setSent(await api.post("/auth/forgot-password", v));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <div>
      <Link href="/login" className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to sign in
      </Link>
      {sent ? (
        <FadeIn>
          <div className="grid size-11 place-items-center rounded-xl border bg-card">
            <Mail className="size-5 text-brand" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{sent.message} The link expires in 30 minutes.</p>
          {sent.devResetLink && (
            <div className="mt-5 rounded-lg border border-dashed p-3 text-xs">
              <div className="font-medium text-muted-foreground">Development only — no email provider configured</div>
              <Link href={sent.devResetLink.replace(/^https?:\/\/[^/]+/, "")} className="mt-1 block break-all text-brand hover:underline">
                Open reset link
              </Link>
            </div>
          )}
        </FadeIn>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Enter your work email and we&apos;ll send you a reset link.</p>
          <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
            <Field label="Work email" htmlFor="email" error={form.formState.errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" autoFocus {...form.register("email")} />
            </Field>
            <Button type="submit" className="h-10" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <LoaderCircle className="animate-spin" />}
              Send reset link
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
