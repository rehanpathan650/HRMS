"use client";

import { KeyRound } from "lucide-react";
import { ChangePasswordForm } from "@/components/shared/change-password-form";

export function ForcedChange({ target, forced }: { target: string; forced: boolean }) {
  return (
    <div>
      <div className="grid size-11 place-items-center rounded-xl border bg-card">
        <KeyRound className="size-5 text-brand" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">{forced ? "Set your password" : "Change password"}</h1>
      <p className="mt-1.5 mb-6 text-sm text-muted-foreground">
        {forced
          ? "Your account uses a temporary password. Choose a new one to continue."
          : "Choose a strong password you don't use elsewhere."}
      </p>
      <ChangePasswordForm onDone={() => window.location.assign(target)} />
    </div>
  );
}
