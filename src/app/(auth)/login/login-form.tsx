"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, LoaderCircle, CircleAlert } from "lucide-react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { loginSchema } from "@/lib/validators/auth";
import { api, errorMessage } from "@/lib/api-client";

type Values = z.infer<typeof loginSchema>;

/** Returns a same-origin path for `next`, or null. Blocks `//evil`, `/\evil`, `javascript:` etc. */
function sameOriginPath(next: string | null) {
  if (!next || !next.startsWith("/")) return null;
  try {
    const url = new URL(next, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search : null;
  } catch {
    return null;
  }
}

export function LoginForm() {
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await api.post<{ role: string; mustChangePassword: boolean }>("/auth/login", values);
      const safeNext = sameOriginPath(params.get("next"));
      const target = res.mustChangePassword
        ? "/change-password"
        : safeNext && (res.role === "ADMIN" || safeNext.startsWith("/employee"))
          ? safeNext
          : res.role === "ADMIN"
            ? "/admin/dashboard"
            : "/employee/dashboard";
      // Full navigation: guarantees server layouts re-read the fresh session cookie.
      window.location.assign(target);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Sign in to your workspace to continue.</p>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-5 flex items-start gap-2 rounded-lg border border-destructive/25 bg-danger-soft px-3 py-2.5 text-[13px] text-danger" role="alert">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
        <Field label="Work email" htmlFor="email" error={form.formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="username" placeholder="you@company.com" autoFocus {...form.register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={form.formState.errors.password?.message}>
          <div className="relative">
            <Input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              className="pr-9"
              {...form.register("password")}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-0 right-0 grid w-9 place-items-center text-muted-foreground hover:text-foreground"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <div className="-mt-1 flex justify-end">
          <Link href="/forgot-password" className="text-[13px] font-medium text-muted-foreground hover:text-foreground">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="h-10" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <LoaderCircle className="animate-spin" />}
          Sign in
        </Button>
      </form>
    </div>
  );
}
