"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Building2, Calendar, CalendarCheck, CalendarX, Clock3, Hash, KeyRound, Mail, MapPin, Pencil, Phone, Timer, Trash2, TriangleAlert, UserX, Users } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/shared/page-header";
import { UserAvatar } from "@/components/shared/user-avatar";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmployeeFormDialog, TempPasswordDialog } from "@/components/admin/employee-form";
import { AttendanceCalendar } from "@/components/attendance/attendance-calendar";
import { AttendanceTable } from "@/components/admin/attendance-table";
import { BalanceList } from "@/components/leave/balance-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useGsapReveal } from "@/hooks/use-gsap-reveal";
import { useMe } from "@/hooks/use-me";
import { api, errorMessage } from "@/lib/api-client";
import { fmtDate, fmtDateTime, minutesToHuman, monthRange, todayYmd } from "@/lib/format";
import type { Employee, EmployeeSummary, LeaveBalance } from "@/lib/types";

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [editing, setEditing] = useState(false);
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [month, setMonth] = useState(todayYmd());
  const [editBalances, setEditBalances] = useState(false);
  const range = monthRange(month);
  const emp = useQuery({ queryKey: ["admin", "employee", id], queryFn: () => api.get<Employee>(`/admin/employees/${id}`) });
  const summary = useQuery({
    queryKey: ["admin", "employee", id, "summary", range.from],
    queryFn: () => api.get<EmployeeSummary & { balances: LeaveBalance[] }>(`/admin/employees/${id}/summary`, range),
    placeholderData: (p) => p,
  });
  const scope = useGsapReveal(!!emp.data);

  const deactivate = useMutation({
    mutationFn: () => api.patch(`/admin/employees/${id}`, { status: "INACTIVE" }),
    onSuccess: () => { toast.success("Account deactivated and sessions revoked"); qc.invalidateQueries({ queryKey: ["admin"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/admin/employees/${id}`),
    onSuccess: () => { toast.success("Employee deleted"); qc.invalidateQueries({ queryKey: ["admin"] }); router.replace("/admin/employees"); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const resetPw = useMutation({
    mutationFn: () => api.post<{ temporaryPassword: string }>(`/admin/employees/${id}/reset-password`),
    onSuccess: (r) => setTempPw(r.temporaryPassword),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const saveBalance = useMutation({
    mutationFn: (b: { leaveTypeId: string; allocated: number }) =>
      api.put(`/admin/employees/${id}/balances`, { ...b, year: Number(range.to.slice(0, 4)) }),
    onSuccess: () => { toast.success("Allocation updated"); qc.invalidateQueries({ queryKey: ["admin", "employee", id] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (emp.isLoading || !emp.data) {
    return <div className="grid gap-6"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  }
  const e = emp.data;
  const t = summary.data?.totals;
  const isSelf = me?.employee?.id === e.id;

  return (
    <div ref={scope} className="grid gap-6">
      <section className="rounded-xl bg-card p-5 card-elevated" data-reveal>
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-4">
            <UserAvatar name={e.name} src={e.avatarUrl} className="size-16 text-base" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{e.name}</h1>
                <StatusBadge status={e.status} />
                {e.role === "ADMIN" && <StatusBadge status="ADMIN" />}
              </div>
              <p className="text-sm text-muted-foreground">{e.designation} · {e.department?.name ?? "No department"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Last sign-in: {e.lastLoginAt ? fmtDateTime(e.lastLoginAt) : "never"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
            <ConfirmDialog
              trigger={<Button variant="outline" size="sm" disabled={isSelf}><KeyRound /> Reset password</Button>}
              title="Reset password?"
              description="A new temporary password will be generated and all of this employee's sessions will be signed out."
              confirmLabel="Reset password"
              onConfirm={() => resetPw.mutateAsync()}
            />
            {e.isActive && (
              <ConfirmDialog
                trigger={<Button variant="outline" size="sm" disabled={isSelf}><UserX /> Deactivate</Button>}
                title={`Deactivate ${e.name}?`}
                description="They will be signed out immediately and won't be able to sign in. Their records are preserved, and you can reactivate them later by editing their status."
                confirmLabel="Deactivate"
                destructive
                onConfirm={() => deactivate.mutateAsync()}
              />
            )}
            <ConfirmDialog
              trigger={<Button variant="ghost" size="sm" className="text-danger hover:text-danger" disabled={isSelf}><Trash2 /> Delete</Button>}
              title="Permanently delete this employee?"
              description="This cannot be undone. Employees with attendance history can't be deleted; deactivate them instead."
              confirmLabel="Delete permanently"
              destructive
              onConfirm={() => remove.mutateAsync()}
            />
          </div>
        </div>
        <dl className="mt-5 grid gap-x-6 gap-y-3 border-t pt-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { I: Hash, l: "Employee ID", v: e.employeeCode },
            { I: Mail, l: "Email", v: e.email },
            { I: Phone, l: "Phone", v: e.phone ?? "—" },
            { I: Calendar, l: "Joined", v: fmtDate(e.joiningDate) },
            { I: Users, l: "Manager", v: e.manager?.name ?? "—" },
            { I: Building2, l: "Department", v: e.department?.name ?? "—" },
            { I: Clock3, l: "Schedule", v: e.workSchedule?.name ?? "Company default" },
            { I: MapPin, l: "Office", v: `${e.officeLocation?.name ?? "Company default"}${e.allowRemote ? " · remote allowed" : ""}` },
          ].map(({ I, l, v }) => (
            <div key={l} className="flex gap-2.5">
              <I className="mt-0.5 size-4 text-muted-foreground" />
              <div className="min-w-0"><dt className="text-xs text-muted-foreground">{l}</dt><dd className="truncate text-[13px] font-medium">{v}</dd></div>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Present" value={t?.present ?? 0} icon={CalendarCheck} tone="success" loading={summary.isLoading} hint={fmtDate(range.from, { day: undefined })} />
        <StatCard label="Absent" value={t?.absent ?? 0} icon={CalendarX} tone="danger" loading={summary.isLoading} />
        <StatCard label="Late" value={t?.late ?? 0} icon={TriangleAlert} tone="warning" loading={summary.isLoading} />
        <StatCard label="Leave days" value={t?.onLeave ?? 0} icon={Briefcase} tone="brand" loading={summary.isLoading} />
        <StatCard label="Hours" value={(t?.workedMinutes ?? 0) / 60} decimals={1} suffix="h" icon={Timer} tone="info" loading={summary.isLoading} hint={`avg ${minutesToHuman(t?.avgWorkedMinutes ?? 0)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="grid content-start gap-6">
          <SectionCard title="Calendar">
            <AttendanceCalendar month={month} days={summary.data?.days} loading={summary.isLoading} onMonthChange={setMonth} timezone={me?.company.timezone} />
          </SectionCard>
          <SectionCard
            title="Leave balances"
            actions={<Button variant="ghost" size="xs" onClick={() => setEditBalances((v) => !v)}>{editBalances ? "Done" : "Adjust"}</Button>}
          >
            {editBalances ? (
              <ul className="grid gap-3">
                {summary.data?.balances.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium">{b.leaveType.name}</span>
                    <form
                      className="flex items-center gap-1.5"
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        const v = Number(new FormData(ev.currentTarget).get("alloc"));
                        if (Number.isFinite(v) && v >= 0) saveBalance.mutate({ leaveTypeId: b.leaveType.id, allocated: v });
                      }}
                    >
                      <Input name="alloc" type="number" min={0} max={365} step={0.5} defaultValue={b.allocated} className="h-8 w-20 text-right" aria-label={`${b.leaveType.name} allocation`} />
                      <Button size="sm" variant="outline" type="submit" disabled={saveBalance.isPending}>Save</Button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <BalanceList balances={summary.data?.balances} loading={summary.isLoading} />
            )}
          </SectionCard>
        </div>
        <SectionCard title="Attendance history" bodyClassName="p-0">
          <AttendanceTable key={range.from} initialRange={range} employeeId={id} pageSize={12} />
        </SectionCard>
      </div>

      <EmployeeFormDialog open={editing} onOpenChange={(o) => { setEditing(o); if (!o) qc.invalidateQueries({ queryKey: ["admin", "employee", id] }); }} employee={e} />
      <TempPasswordDialog password={tempPw} onClose={() => setTempPw(null)} title="Password reset" />
    </div>
  );
}
