"use client";

import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Building2, Calendar, Camera, Hash, LoaderCircle, Mail, MapPin, User, Users, Clock3 } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { PageHeader, SectionCard } from "@/components/shared/page-header";
import { Field } from "@/components/shared/field";
import { UserAvatar } from "@/components/shared/user-avatar";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { selfProfileSchema } from "@/lib/validators/employee";
import { api, errorMessage } from "@/lib/api-client";
import { fmtDate } from "@/lib/format";
import type { Employee } from "@/lib/types";

type Values = z.input<typeof selfProfileSchema>;

export default function ProfilePage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: me, isLoading } = useQuery({ queryKey: ["me", "profile"], queryFn: () => api.get<Employee>("/me/profile") });
  const form = useForm<Values>({ resolver: zodResolver(selfProfileSchema) });

  useEffect(() => {
    if (me)
      form.reset({
        phone: me.phone ?? "",
        address: me.address ?? "",
        emergencyContact: me.emergencyContact ?? "",
        dateOfBirth: me.dateOfBirth ?? undefined,
      });
  }, [me, form]);

  const save = form.handleSubmit(async (v) => {
    try {
      await api.patch("/me/profile", { ...v, dateOfBirth: v.dateOfBirth || null });
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("avatar", file);
      return api.upload("/me/avatar", fd);
    },
    onSuccess: () => {
      toast.success("Profile photo updated");
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading || !me) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const facts = [
    { I: Hash, l: "Employee ID", v: me.employeeCode },
    { I: Mail, l: "Email", v: me.email },
    { I: Briefcase, l: "Designation", v: me.designation },
    { I: Building2, l: "Department", v: me.department?.name ?? "—" },
    { I: Users, l: "Reporting manager", v: me.manager?.name ?? "—" },
    { I: Calendar, l: "Joined", v: fmtDate(me.joiningDate) },
    { I: Clock3, l: "Work schedule", v: me.workSchedule?.name ?? "Default" },
    { I: MapPin, l: "Office", v: me.officeLocation?.name ?? "Default" },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader title="Profile" description="Your employment details and personal information." />
      <SectionCard>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative w-fit">
            <UserAvatar name={me.name} src={me.avatarUrl} className="size-20 text-lg" />
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full border bg-card shadow-sm hover:bg-muted"
              aria-label="Change profile photo"
              disabled={upload.isPending}
            >
              {upload.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = "";
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{me.name}</h2>
              <StatusBadge status={me.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {me.designation} · {me.department?.name ?? "No department"}
            </p>
          </div>
        </div>
        <dl className="mt-6 grid gap-x-6 gap-y-4 border-t pt-6 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map(({ I, l, v }) => (
            <div key={l} className="flex gap-2.5">
              <I className="mt-0.5 size-4 text-muted-foreground" />
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{l}</dt>
                <dd className="truncate text-[13px] font-medium">{v}</dd>
              </div>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-xs text-muted-foreground">Employment details are managed by your administrator.</p>
      </SectionCard>

      <SectionCard title="Personal information" description="You can update these details yourself.">
        <form onSubmit={save} className="grid max-w-2xl gap-4 sm:grid-cols-2" noValidate>
          <Field label="Phone" htmlFor="phone" error={form.formState.errors.phone?.message}>
            <Input id="phone" autoComplete="tel" {...form.register("phone")} />
          </Field>
          <Field label="Date of birth" htmlFor="dob" error={form.formState.errors.dateOfBirth?.message}>
            <Input id="dob" type="date" {...form.register("dateOfBirth")} />
          </Field>
          <Field label="Emergency contact" htmlFor="ec" className="sm:col-span-2" error={form.formState.errors.emergencyContact?.message}>
            <Input id="ec" placeholder="Name and phone number" {...form.register("emergencyContact")} />
          </Field>
          <Field label="Address" htmlFor="addr" className="sm:col-span-2" error={form.formState.errors.address?.message}>
            <Input id="addr" autoComplete="street-address" {...form.register("address")} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
              {form.formState.isSubmitting ? <LoaderCircle className="animate-spin" /> : <User />}
              Save changes
            </Button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
