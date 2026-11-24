"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, LoaderCircle, LocateFixed, MapPin, Megaphone, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { PageHeader, SectionCard } from "@/components/shared/page-header";
import { Field } from "@/components/shared/field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ChangePasswordForm } from "@/components/shared/change-password-form";
import { AppearancePicker } from "@/components/shared/appearance-card";
import { Pill } from "@/components/shared/status-badge";
import { GeoMap } from "@/components/map/geo-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { announcementSchema, officeLocationSchema, systemSettingsSchema, workScheduleSchema } from "@/lib/validators/org";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Settings = z.infer<typeof systemSettingsSchema>;
type Office = z.infer<typeof officeLocationSchema> & { id: string; employeeCount: number };
type Schedule = z.infer<typeof workScheduleSchema> & { id: string; employeeCount: number; overnight: boolean };

const TIMEZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC", "Asia/Kolkata"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border p-3.5">
      <span>
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function GeneralTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "settings"], queryFn: () => api.get<Settings>("/admin/settings") });
  const form = useForm<Settings>({ resolver: zodResolver(systemSettingsSchema), values: data });
  const e = form.formState.errors;
  const save = form.handleSubmit(async (v) => {
    try {
      await api.put("/admin/settings", v);
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });
  if (!data) return <Skeleton className="h-96" />;
  return (
    <form onSubmit={save} className="grid gap-6" noValidate>
      <SectionCard title="Organization">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" htmlFor="cn" error={e.companyName?.message}><Input id="cn" {...form.register("companyName")} /></Field>
          <Field label="Timezone" htmlFor="tz" hint="Work dates, late arrivals and reports use this timezone.">
            <Input id="tz" list="tz-list" {...form.register("timezone")} />
            <datalist id="tz-list">{TIMEZONES.map((t) => <option key={t} value={t} />)}</datalist>
          </Field>
        </div>
      </SectionCard>
      <SectionCard title="Attendance policy" description="Applies to all check-ins. Per-employee remote access is set on each employee.">
        <div className="grid gap-3">
          <ToggleRow label="Allow remote attendance" hint="Accept check-ins outside the office radius for everyone (always flagged for review)." checked={form.watch("allowRemoteAttendance")} onChange={(v) => form.setValue("allowRemoteAttendance", v, { shouldDirty: true })} />
          <ToggleRow label="Require selfie at check-out" hint="Check-out selfie becomes mandatory instead of optional." checked={form.watch("requireCheckoutSelfie")} onChange={(v) => form.setValue("requireCheckoutSelfie", v, { shouldDirty: true })} />
          <ToggleRow label="Auto-approve clean check-ins" hint="Check-ins inside the geofence with no risk signals skip the verification queue." checked={form.watch("autoApproveInGeofence")} onChange={(v) => form.setValue("autoApproveInGeofence", v, { shouldDirty: true })} />
          <Field label="Maximum GPS accuracy (meters)" htmlFor="acc" hint="Readings less accurate than this are flagged for review." error={e.maxGpsAccuracyMeters?.message} className="sm:max-w-xs">
            <Input id="acc" type="number" {...form.register("maxGpsAccuracyMeters", { valueAsNumber: true })} />
          </Field>
        </div>
      </SectionCard>
      <SectionCard title="Data retention" description="Sensitive evidence is deleted automatically after these periods.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Selfie retention (days)" htmlFor="sr" error={e.selfieRetentionDays?.message} hint="Image files are deleted; the hash and metadata remain as proof.">
            <Input id="sr" type="number" {...form.register("selfieRetentionDays", { valueAsNumber: true })} />
          </Field>
          <Field label="Audit log retention (days)" htmlFor="ar" error={e.auditRetentionDays?.message}>
            <Input id="ar" type="number" {...form.register("auditRetentionDays", { valueAsNumber: true })} />
          </Field>
        </div>
      </SectionCard>
      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty} className="shadow-lg">
          {form.formState.isSubmitting ? <LoaderCircle className="animate-spin" /> : <Save />} Save settings
        </Button>
      </div>
    </form>
  );
}

function OfficeDialog({ open, office, onClose }: { open: boolean; office?: Office; onClose: () => void }) {
  const qc = useQueryClient();
  const form = useForm<z.input<typeof officeLocationSchema>>({
    resolver: zodResolver(officeLocationSchema),
    values: office ?? { name: "", address: "", latitude: 12.9716, longitude: 77.5946, radiusMeters: 200, isDefault: false },
  });
  const [lat, lng, radius] = [form.watch("latitude"), form.watch("longitude"), form.watch("radiusMeters")];
  const [locating, setLocating] = useState(false);
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (v) => {
    try {
      if (office) await api.patch(`/admin/offices/${office.id}`, v);
      else await api.post("/admin/offices", v);
      toast.success("Office saved");
      qc.invalidateQueries({ queryKey: ["admin"] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });
  const useMyLocation = () => {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        form.setValue("latitude", Number(p.coords.latitude.toFixed(6)), { shouldDirty: true });
        form.setValue("longitude", Number(p.coords.longitude.toFixed(6)), { shouldDirty: true });
        setLocating(false);
      },
      () => { toast.error("Couldn't get your location"); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{office ? "Edit office" : "New office location"}</DialogTitle>
          <DialogDescription>Click the map to place the office, then set the check-in radius.</DialogDescription>
        </DialogHeader>
        {valid && (
          <GeoMap
            height={260}
            geofence={{ latitude: lat, longitude: lng, radiusMeters: radius || 0, label: form.watch("name") || "Office" }}
            onPick={(la, ln) => {
              form.setValue("latitude", Number(la.toFixed(6)), { shouldDirty: true });
              form.setValue("longitude", Number(ln.toFixed(6)), { shouldDirty: true });
            }}
          />
        )}
        <form id="office-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Name" htmlFor="on" error={e.name?.message}><Input id="on" {...form.register("name")} /></Field>
          <Field label="Address" htmlFor="oa"><Input id="oa" {...form.register("address")} /></Field>
          <Field label="Latitude" htmlFor="olat" error={e.latitude?.message}><Input id="olat" type="number" step="any" {...form.register("latitude", { valueAsNumber: true })} /></Field>
          <Field label="Longitude" htmlFor="olng" error={e.longitude?.message}><Input id="olng" type="number" step="any" {...form.register("longitude", { valueAsNumber: true })} /></Field>
          <Field label="Check-in radius (meters)" htmlFor="or" error={e.radiusMeters?.message} hint="Default 200 m. GPS indoors is often ±20–50 m.">
            <Input id="or" type="number" {...form.register("radiusMeters", { valueAsNumber: true })} />
          </Field>
          <div className="flex items-end gap-2">
            <Button type="button" variant="outline" onClick={useMyLocation} disabled={locating}>
              {locating ? <LoaderCircle className="animate-spin" /> : <LocateFixed />} Use my location
            </Button>
          </div>
          <label className="flex items-center justify-between rounded-lg border p-3 text-[13px] font-medium sm:col-span-2">
            Default office for employees without an assigned office
            <Switch checked={form.watch("isDefault")} onCheckedChange={(c) => form.setValue("isDefault", c, { shouldDirty: true })} />
          </label>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="office-form" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting && <LoaderCircle className="animate-spin" />}Save office</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OfficesTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; office?: Office }>({ open: false });
  const { data } = useQuery({ queryKey: ["admin", "offices"], queryFn: () => api.get<Office[]>("/admin/offices") });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/offices/${id}`),
    onSuccess: () => { toast.success("Office deleted"); qc.invalidateQueries({ queryKey: ["admin"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <SectionCard title="Office locations" description="Geofences used for location verification." actions={<Button size="sm" onClick={() => setDialog({ open: true })}><Plus /> Add office</Button>}>
      <div className="grid gap-4 md:grid-cols-2">
        {data?.map((o) => (
          <div key={o.id} className="overflow-hidden rounded-xl border">
            <GeoMap height={170} interactive={false} geofence={{ ...o, label: o.name }} className="rounded-none border-0 border-b" />
            <div className="flex items-start justify-between gap-3 p-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">{o.name}{o.isDefault && <Pill tone="brand">Default</Pill>}</div>
                <div className="truncate text-xs text-muted-foreground">{o.address ?? `${o.latitude.toFixed(5)}, ${o.longitude.toFixed(5)}`}</div>
                <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{o.radiusMeters} m radius</span>
                  <span>{o.employeeCount} assigned</span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label="Edit office" onClick={() => setDialog({ open: true, office: o })}><Pencil /></Button>
                {!o.isDefault && (
                  <ConfirmDialog trigger={<Button size="icon-sm" variant="ghost" aria-label="Delete office" className="text-danger"><Trash2 /></Button>} title={`Delete ${o.name}?`} description="Employees assigned here fall back to the default office." destructive confirmLabel="Delete" onConfirm={() => del.mutateAsync(o.id)} />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <OfficeDialog open={dialog.open} office={dialog.office} onClose={() => setDialog({ open: false })} />
    </SectionCard>
  );
}

function ScheduleDialog({ open, schedule, onClose }: { open: boolean; schedule?: Schedule; onClose: () => void }) {
  const qc = useQueryClient();
  const form = useForm<z.input<typeof workScheduleSchema>>({
    resolver: zodResolver(workScheduleSchema),
    values: schedule ?? { name: "", startTime: "09:00", endTime: "18:00", graceMinutes: 10, breakMinutes: 60, halfDayMinutes: 240, workDays: [1, 2, 3, 4, 5], isDefault: false },
  });
  const e = form.formState.errors;
  const days = form.watch("workDays") ?? [];
  const submit = form.handleSubmit(async (v) => {
    try {
      if (schedule) await api.patch(`/admin/schedules/${schedule.id}`, v);
      else await api.post("/admin/schedules", v);
      toast.success("Schedule saved");
      qc.invalidateQueries({ queryKey: ["admin"] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{schedule ? "Edit shift" : "New shift"}</DialogTitle>
          <DialogDescription>An end time earlier than the start creates an overnight shift. Edits don&apos;t change past records.</DialogDescription>
        </DialogHeader>
        <form id="sched-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Name" htmlFor="sn" className="sm:col-span-2" error={e.name?.message}><Input id="sn" {...form.register("name")} /></Field>
          <Field label="Start time" htmlFor="ss" error={e.startTime?.message}><Input id="ss" type="time" {...form.register("startTime")} /></Field>
          <Field label="End time" htmlFor="se" error={e.endTime?.message}><Input id="se" type="time" {...form.register("endTime")} /></Field>
          <Field label="Grace period (min)" htmlFor="sg" error={e.graceMinutes?.message}><Input id="sg" type="number" {...form.register("graceMinutes", { valueAsNumber: true })} /></Field>
          <Field label="Break (min)" htmlFor="sb" error={e.breakMinutes?.message}><Input id="sb" type="number" {...form.register("breakMinutes", { valueAsNumber: true })} /></Field>
          <Field label="Half-day threshold (min worked)" htmlFor="sh" error={e.halfDayMinutes?.message} className="sm:col-span-2"><Input id="sh" type="number" {...form.register("halfDayMinutes", { valueAsNumber: true })} /></Field>
          <Field label="Working days" error={e.workDays?.message} className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => {
                const n = i + 1;
                const on = days.includes(n);
                return (
                  <button type="button" key={d} onClick={() => form.setValue("workDays", on ? days.filter((x) => x !== n) : [...days, n].sort(), { shouldDirty: true })}
                    className={cn("h-8 w-11 rounded-md border text-xs font-medium transition-colors", on ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}>
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
          <label className="flex items-center justify-between rounded-lg border p-3 text-[13px] font-medium sm:col-span-2">
            Company default shift
            <Switch checked={form.watch("isDefault")} onCheckedChange={(c) => form.setValue("isDefault", c, { shouldDirty: true })} />
          </label>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="sched-form" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting && <LoaderCircle className="animate-spin" />}Save shift</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SchedulesTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; schedule?: Schedule }>({ open: false });
  const { data } = useQuery({ queryKey: ["admin", "schedules"], queryFn: () => api.get<Schedule[]>("/admin/schedules") });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/schedules/${id}`),
    onSuccess: () => { toast.success("Shift deleted"); qc.invalidateQueries({ queryKey: ["admin"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <SectionCard title="Shifts & working hours" description="Assign shifts to employees from their profile." actions={<Button size="sm" onClick={() => setDialog({ open: true })}><Plus /> Add shift</Button>} bodyClassName="p-0">
      <ul className="divide-y">
        {data?.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
            <div className="min-w-[180px] flex-1">
              <div className="flex items-center gap-2 text-[13px] font-medium">{s.name}{s.isDefault && <Pill tone="brand">Default</Pill>}{s.overnight && <Pill tone="info">Overnight</Pill>}</div>
              <div className="text-xs text-muted-foreground tabular">{s.startTime} – {s.endTime} · {s.graceMinutes}m grace · {s.breakMinutes}m break · {s.employeeCount} assigned</div>
            </div>
            <div className="flex gap-1">
              {DAYS.map((d, i) => <span key={d} className={cn("grid size-6 place-items-center rounded text-[10px] font-medium", s.workDays.includes(i + 1) ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>{d[0]}</span>)}
            </div>
            <div className="flex gap-1">
              <Button size="icon-sm" variant="ghost" aria-label="Edit shift" onClick={() => setDialog({ open: true, schedule: s })}><Pencil /></Button>
              {!s.isDefault && <ConfirmDialog trigger={<Button size="icon-sm" variant="ghost" aria-label="Delete shift" className="text-danger"><Trash2 /></Button>} title={`Delete ${s.name}?`} description="Assigned employees fall back to the default shift. Past records keep their original shift." destructive confirmLabel="Delete" onConfirm={() => del.mutateAsync(s.id)} />}
            </div>
          </li>
        ))}
      </ul>
      <ScheduleDialog open={dialog.open} schedule={dialog.schedule} onClose={() => setDialog({ open: false })} />
    </SectionCard>
  );
}

function SystemTab() {
  const form = useForm<z.infer<typeof announcementSchema>>({ resolver: zodResolver(announcementSchema), defaultValues: { title: "", body: "" } });
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const retention = useMutation({
    mutationFn: () => api.post<Record<string, number>>("/admin/retention"),
    onSuccess: (r) => { setResult(r); toast.success("Retention policy applied"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const send = form.handleSubmit(async (v) => {
    try {
      const r = await api.post<{ recipients: number }>("/admin/announcements", v);
      toast.success(`Announcement sent to ${r.recipients} people`);
      form.reset();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });
  return (
    <div className="grid gap-6">
      <SectionCard title="Announcement" description="Send an in-app notification to every active user.">
        <form onSubmit={send} className="grid max-w-xl gap-4" noValidate>
          <Field label="Title" htmlFor="at" error={form.formState.errors.title?.message}><Input id="at" {...form.register("title")} /></Field>
          <Field label="Message" htmlFor="ab" error={form.formState.errors.body?.message}><Textarea id="ab" rows={3} {...form.register("body")} /></Field>
          <div><Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <LoaderCircle className="animate-spin" /> : <Megaphone />} Send announcement</Button></div>
        </form>
      </SectionCard>
      <SectionCard title="Run retention now" description="Retention also runs via `npm run retention` (schedule it with cron).">
        <ConfirmDialog trigger={<Button variant="outline"><Database /> Apply retention policy</Button>} title="Apply retention policy now?" description="Expired selfie images and old audit entries are permanently deleted according to your settings." confirmLabel="Run now" onConfirm={() => retention.mutateAsync()} />
        {result && (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
            {Object.entries(result).map(([k, v]) => (
              <div key={k} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</dt><dd className="font-semibold tabular">{v}</dd></div>
            ))}
          </dl>
        )}
      </SectionCard>
    </div>
  );
}

export default function AdminSettingsPage() {
  const [tab, setTab] = useState("general");
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h) setTab(h);
  }, []);
  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description="Company, attendance policy, office geofences, shifts and system tools." />
      <Tabs value={tab} onValueChange={(v) => { setTab(v); history.replaceState(null, "", `#${v}`); }}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="general">General & policy</TabsTrigger>
          <TabsTrigger value="offices">Offices</TabsTrigger>
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="account">My account</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-4"><GeneralTab /></TabsContent>
        <TabsContent value="offices" className="mt-4"><OfficesTab /></TabsContent>
        <TabsContent value="shifts" className="mt-4"><SchedulesTab /></TabsContent>
        <TabsContent value="system" className="mt-4"><SystemTab /></TabsContent>
        <TabsContent value="account" className="mt-4 grid gap-6">
          <SectionCard title="Password"><div className="max-w-md"><ChangePasswordForm /></div></SectionCard>
          <SectionCard title="Appearance"><AppearancePicker /></SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
