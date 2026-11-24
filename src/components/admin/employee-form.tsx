"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field, NativeSelect } from "@/components/shared/field";
import { createEmployeeSchema } from "@/lib/validators/employee";
import { api, errorMessage } from "@/lib/api-client";
import { useLookups } from "@/hooks/use-me";
import { todayYmd } from "@/lib/format";
import type { Employee } from "@/lib/types";

type Values = z.input<typeof createEmployeeSchema>;

export function TempPasswordDialog({ password, onClose, title = "Employee created" }: { password: string | null; onClose: () => void; title?: string }) {
  return (
    <Dialog open={!!password} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="size-4" />{title}</DialogTitle>
          <DialogDescription>
            Share this temporary password securely. It is shown only once, and the employee must change it at first sign-in.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3 font-mono text-sm">
          <span className="flex-1 break-all">{password}</span>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Copy password"
            onClick={() => {
              navigator.clipboard.writeText(password ?? "");
              toast.success("Copied to clipboard");
            }}
          >
            <Copy />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmployeeFormDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employee?: Employee;
}) {
  const qc = useQueryClient();
  const lookups = useLookups(open);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const editing = !!employee;
  const form = useForm<Values>({
    resolver: zodResolver(createEmployeeSchema),
    values: employee
      ? {
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          phone: employee.phone ?? "",
          employeeCode: employee.employeeCode,
          designation: employee.designation,
          joiningDate: employee.joiningDate,
          departmentId: employee.department?.id ?? "",
          managerId: employee.manager?.id ?? "",
          workScheduleId: employee.workSchedule?.id ?? "",
          officeLocationId: employee.officeLocation?.id ?? "",
          status: employee.status,
          role: employee.role,
          allowRemote: employee.allowRemote,
        }
      : {
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          employeeCode: "",
          designation: "",
          joiningDate: todayYmd(),
          departmentId: "",
          managerId: "",
          workScheduleId: "",
          officeLocationId: "",
          status: "ACTIVE",
          role: "EMPLOYEE",
          allowRemote: false,
        },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (editing) {
        await api.patch(`/admin/employees/${employee.id}`, values);
        toast.success("Employee updated");
        onOpenChange(false);
      } else {
        const res = await api.post<{ temporaryPassword: string }>("/admin/employees", values);
        onOpenChange(false);
        form.reset();
        setTempPassword(res.temporaryPassword);
      }
      qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit employee" : "Add employee"}</DialogTitle>
            <DialogDescription>
              {editing ? "Changes are recorded in the audit log." : "A temporary password is generated; the employee sets their own at first sign-in."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate id="employee-form">
            <Field label="First name" htmlFor="fn" error={e.firstName?.message}><Input id="fn" {...form.register("firstName")} /></Field>
            <Field label="Last name" htmlFor="ln" error={e.lastName?.message}><Input id="ln" {...form.register("lastName")} /></Field>
            <Field label="Work email" htmlFor="em" error={e.email?.message}><Input id="em" type="email" {...form.register("email")} /></Field>
            <Field label="Phone" htmlFor="ph" error={e.phone?.message}><Input id="ph" {...form.register("phone")} /></Field>
            <Field label="Employee ID" htmlFor="code" error={e.employeeCode?.message}><Input id="code" placeholder="NW-030" {...form.register("employeeCode")} /></Field>
            <Field label="Designation" htmlFor="des" error={e.designation?.message}><Input id="des" {...form.register("designation")} /></Field>
            <Field label="Joining date" htmlFor="jd" error={e.joiningDate?.message}><Input id="jd" type="date" {...form.register("joiningDate")} /></Field>
            <Field label="Department" htmlFor="dept">
              <NativeSelect id="dept" {...form.register("departmentId")}>
                <option value="">— None —</option>
                {lookups.data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Reporting manager" htmlFor="mgr" error={e.managerId?.message}>
              <NativeSelect id="mgr" {...form.register("managerId")}>
                <option value="">— None —</option>
                {lookups.data?.employees.filter((x) => x.id !== employee?.id).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.employeeCode})</option>)}
              </NativeSelect>
            </Field>
            <Field label="Work schedule" htmlFor="ws">
              <NativeSelect id="ws" {...form.register("workScheduleId")}>
                <option value="">Company default</option>
                {lookups.data?.schedules.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isDefault ? " (default)" : ""}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Office location" htmlFor="ol">
              <NativeSelect id="ol" {...form.register("officeLocationId")}>
                <option value="">Company default</option>
                {lookups.data?.offices.map((o) => <option key={o.id} value={o.id}>{o.name}{o.isDefault ? " (default)" : ""}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Employment status" htmlFor="st">
              <NativeSelect id="st" {...form.register("status")}>
                <option value="ACTIVE">Active</option>
                <option value="PROBATION">Probation</option>
                <option value="NOTICE">Notice period</option>
                <option value="INACTIVE">Inactive (cannot sign in)</option>
                <option value="TERMINATED">Terminated (cannot sign in)</option>
              </NativeSelect>
            </Field>
            <Field label="Access role" htmlFor="role">
              <NativeSelect id="role" {...form.register("role")}>
                <option value="EMPLOYEE">Employee</option>
                <option value="ADMIN">Administrator</option>
              </NativeSelect>
            </Field>
            <label className="flex items-center justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
              <span>
                <span className="block text-[13px] font-medium">Allow remote check-in</span>
                <span className="block text-xs text-muted-foreground">Check-ins outside the geofence are accepted but flagged for review.</span>
              </span>
              <Switch checked={form.watch("allowRemote")} onCheckedChange={(c) => form.setValue("allowRemote", c, { shouldDirty: true })} />
            </label>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" form="employee-form" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <LoaderCircle className="animate-spin" />}
              {editing ? "Save changes" : "Create employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TempPasswordDialog password={tempPassword} onClose={() => setTempPassword(null)} />
    </>
  );
}
