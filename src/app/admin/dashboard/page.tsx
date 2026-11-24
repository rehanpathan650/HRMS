"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarX,
  Clock3,
  LogIn,
  LogOut,
  Percent,
  Plane,
  ShieldCheck,
  Timer,
  TriangleAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { PageHeader, SectionCard } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { NativeSelect } from "@/components/shared/field";
import { PersonCell } from "@/components/shared/user-avatar";
import { EmptyState, ErrorState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-badge";
import { AttendanceTrendChart, DepartmentBars, RateLineChart, type DeptRow, type TrendPoint } from "@/components/charts/attendance-charts";
import { AttendanceTable } from "@/components/admin/attendance-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLookups } from "@/hooks/use-me";
import { useGsapReveal } from "@/hooks/use-gsap-reveal";
import { api } from "@/lib/api-client";
import { fmtTime, meters, minutesToHuman, relativeTime } from "@/lib/format";

interface ActivityItem {
  id: string;
  attendanceId: string;
  at: string;
  withinGeofence: boolean;
  distanceMeters: number | null;
  status: string;
  isLate: boolean;
  flags: string[];
  employee: { id: string; name: string; designation: string; department: string | null; avatarUrl: string | null };
}

interface Overview {
  today: string;
  timezone: string;
  metrics: {
    totalEmployees: number;
    presentToday: number;
    absentToday: number;
    checkedInNow: number;
    onLeaveToday: number;
    lateToday: number;
    pendingToday: number;
    expectedToday: number;
    attendanceRateToday: number;
    attendanceRatePeriod: number;
    avgWorkedMinutes: number;
    pendingVerification: number;
    pendingLeaves: number;
  };
  trend: TrendPoint[];
  departments: DeptRow[];
  activity: { checkIns: ActivityItem[]; checkOuts: ActivityItem[] };
}

function ActivityList({ items, tz, kind }: { items: ActivityItem[]; tz: string; kind: "in" | "out" }) {
  if (!items.length) return <EmptyState icon={kind === "in" ? LogIn : LogOut} title={`No recent check-${kind}s`} className="py-8" />;
  return (
    <ul className="divide-y">
      {items.map((a) => (
        <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
          <div className="min-w-0 flex-1">
            <PersonCell name={a.employee.name} src={a.employee.avatarUrl} subtitle={a.employee.department ?? a.employee.designation} />
          </div>
          <div className="text-right">
            <div className="text-[13px] font-medium tabular">{fmtTime(a.at, tz)}</div>
            <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
              {kind === "in" && a.isLate && <Pill tone="warning">Late</Pill>}
              {!a.withinGeofence ? <Pill tone="danger">{meters(a.distanceMeters)} away</Pill> : relativeTime(a.at)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function AdminDashboard() {
  const [days, setDays] = useState("14");
  const [dept, setDept] = useState("");
  const lookups = useLookups();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "overview", days, dept],
    queryFn: () => api.get<Overview>("/admin/overview", { days, departmentId: dept || undefined }),
    refetchInterval: 60_000,
    placeholderData: (p) => p,
  });
  const scope = useGsapReveal(!isLoading);
  const m = data?.metrics;
  const tz = data?.timezone ?? "UTC";

  if (isError && !data) return <ErrorState message="Couldn't load the dashboard." onRetry={() => refetch()} />;

  return (
    <div ref={scope} className="grid gap-6">
      <PageHeader
        title="Dashboard"
        description={data ? `Workforce attendance for ${new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${data.today}T00:00:00Z`))}` : "Workforce attendance overview"}
        actions={
          <>
            <NativeSelect value={dept} onChange={(e) => setDept(e.target.value)} className="h-8 w-auto text-xs" aria-label="Department filter">
              <option value="">All departments</option>
              {lookups.data?.departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </NativeSelect>
            <Tabs value={days} onValueChange={setDays}>
              <TabsList className="h-8">
                <TabsTrigger value="7" className="px-2.5 text-xs">7D</TabsTrigger>
                <TabsTrigger value="14" className="px-2.5 text-xs">14D</TabsTrigger>
                <TabsTrigger value="30" className="px-2.5 text-xs">30D</TabsTrigger>
              </TabsList>
            </Tabs>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total employees" value={m?.totalEmployees ?? 0} icon={Users} loading={isLoading} hint={`${m?.expectedToday ?? 0} scheduled today`} />
        <StatCard label="Present today" value={m?.presentToday ?? 0} icon={UserCheck} tone="success" loading={isLoading} hint={`${m?.pendingToday ?? 0} pending review`} />
        <StatCard label="Absent / not in" value={m?.absentToday ?? 0} icon={CalendarX} tone="danger" loading={isLoading} hint="Scheduled, no check-in" />
        <StatCard label="Checked in now" value={m?.checkedInNow ?? 0} icon={Clock3} tone="brand" loading={isLoading} hint="Active sessions" />
        <StatCard label="On leave" value={m?.onLeaveToday ?? 0} icon={Plane} tone="info" loading={isLoading} hint={`${m?.pendingLeaves ?? 0} requests pending`} />
        <StatCard label="Late arrivals" value={m?.lateToday ?? 0} icon={TriangleAlert} tone="warning" loading={isLoading} hint="After grace period" />
        <StatCard label="Attendance today" value={m?.attendanceRateToday ?? 0} decimals={1} suffix="%" icon={Percent} tone="success" loading={isLoading} hint={`${m?.attendanceRatePeriod ?? 0}% over ${days} days`} />
        <StatCard label="Avg. working hours" value={(m?.avgWorkedMinutes ?? 0) / 60} decimals={1} suffix="h" icon={Timer} tone="brand" loading={isLoading} hint={`${minutesToHuman(m?.avgWorkedMinutes ?? 0)} per completed day`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <SectionCard title="Attendance trend" description={`Daily breakdown, last ${days} days`}>
          {isLoading || !data ? <Skeleton className="h-[290px]" /> : <AttendanceTrendChart data={data.trend} />}
        </SectionCard>
        <div className="grid gap-6">
          <SectionCard title="Attendance rate" description="Present ÷ scheduled, per day">
            {isLoading || !data ? <Skeleton className="h-[160px]" /> : <RateLineChart data={data.trend} />}
          </SectionCard>
          <SectionCard
            title="Verification queue"
            actions={
              <Button asChild variant="ghost" size="xs">
                <Link href="/admin/attendance/verification">Review <ArrowRight /></Link>
              </Button>
            }
          >
            <div className="flex items-center gap-4">
              <div className="grid size-12 place-items-center rounded-xl bg-warning-soft">
                <ShieldCheck className="size-5 text-warning" />
              </div>
              <div>
                <div className="text-2xl font-semibold tabular">{m?.pendingVerification ?? "—"}</div>
                <div className="text-xs text-muted-foreground">records awaiting review</div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Department attendance" description="Present vs. scheduled today">
          {isLoading || !data ? <Skeleton className="h-48" /> : data.departments.length ? <DepartmentBars rows={data.departments} /> : <EmptyState icon={Users} title="No departments" />}
        </SectionCard>
        <SectionCard title="Recent check-ins" bodyClassName="p-0">
          {data ? <ActivityList items={data.activity.checkIns} tz={tz} kind="in" /> : <Skeleton className="m-5 h-48" />}
        </SectionCard>
        <SectionCard title="Recent check-outs" bodyClassName="p-0">
          {data ? <ActivityList items={data.activity.checkOuts} tz={tz} kind="out" /> : <Skeleton className="m-5 h-48" />}
        </SectionCard>
      </div>

      {data && (
        <SectionCard title="Today's attendance" description="Click a row to inspect evidence" bodyClassName="p-0">
          <AttendanceTable initialRange={{ from: data.today, to: data.today }} showRange={false} pageSize={10} />
        </SectionCard>
      )}
    </div>
  );
}
