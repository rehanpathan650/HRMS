"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellOff, Camera, MapPin } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/shared/page-header";
import { ChangePasswordForm } from "@/components/shared/change-password-form";
import { AppearancePicker } from "@/components/shared/appearance-card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

export default function EmployeeSettingsPage() {
  const qc = useQueryClient();
  const markAll = useMutation({
    mutationFn: () => api.post("/notifications", { all: true }),
    onSuccess: () => {
      toast.success("All notifications marked as read");
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description="Security, appearance and privacy preferences." />
      <SectionCard title="Password" description="Changing your password signs out your other sessions.">
        <div className="max-w-md">
          <ChangePasswordForm />
        </div>
      </SectionCard>
      <SectionCard title="Appearance">
        <AppearancePicker />
      </SectionCard>
      <SectionCard title="Privacy & permissions">
        <ul className="grid gap-4 text-[13px]">
          <li className="flex gap-3">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="font-medium">Location</div>
              <div className="text-xs text-muted-foreground">
                Requested only when you check in or out. We never track location in the background. You can revoke access in your
                browser&apos;s site settings.
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <Camera className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="font-medium">Camera</div>
              <div className="text-xs text-muted-foreground">
                Used only during the selfie step. The camera turns off as soon as the photo is captured. Selfies are retained per company policy and then deleted.
              </div>
            </div>
          </li>
        </ul>
      </SectionCard>
      <SectionCard title="Notifications">
        <Button variant="outline" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
          <BellOff /> Mark all as read
        </Button>
      </SectionCard>
    </div>
  );
}
