"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarCheck, CalendarPlus, Clock3, Hourglass, Inbox, Timer, TriangleAlert } from "lucide-react";
import { AttendanceCard, useToday } from "@/components/attendance/attendance-card";
import { AttendanceCalendar } from "@/components/attendance/attendance-calendar";
import { BalanceList } from "@/components/leave/balance-list";
import { SectionCard } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { useMyBalances, useMyLeaves, useMyRecords, useMySummary } from "@/hooks/use-employee-data";
import { useGsapReveal } from "@/hooks/use-gsap-reveal";
import { fmtDate, fmtTime, minutesToHuman, monthRange, todayYmd } from "@/lib/format";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function EmployeeDashboard() {
  const { data: me } = useMe();
  const today = useToday();
  const ref = todayYmd();
  const [month, setMonth] = useState(today.data?.workDate ?? ref);
  const range = monthRange(month);
  const current = monthRange(today.data?.workDate ?? ref);
  const summary = useMySummary(range.from, range.to);
  const thisMonth = useMySummary(current.from, current.to);
  const records = useMyRecords({ page: 1, pageSize: 6 });
  const balances = useMyBalances();
  const pending = useMyLeaves({ page: 1, status: "PENDING", pageSize: 4 });
  const scope = useGsapReveal(!thisMonth.isLoading);
  const tz = today.data?.timezone;
  const t = thisMonth.data?.totals;

  return (
    <div ref={scope} className="grid gap-6">
      <div data-reveal className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-[22px]">
            {greeting(new Date().getHours())}, {me?.employee?.firstName ?? "there"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: tz }).format(new Date())}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/employee/leaves/apply">
            <CalendarPlus /> Apply for leave
          </Link>
        </Button>
      </div>

      <AttendanceCard />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Days present" value={t?.present ?? 0} icon={CalendarCheck} tone="success" loading={thisMonth.isLoading} hint="This month" />
        <StatCard label="Late arrivals" value={t?.late ?? 0} icon={TriangleAlert} tone="warning" loading={thisMonth.isLoading} hint={`${t?.earlyDepartures ?? 0} early departures`} />
        <StatCard
          label="Avg. working hours"
          value={(t?.avgWorkedMinutes ?? 0) / 60}
          decimals={1}
          suffix="h"
          icon={Timer}
          tone="brand"
          loading={thisMonth.isLoading}
          hint={`${minutesToHuman(t?.workedMinutes ?? 0)} total`}
        />
        <StatCard label="Attendance rate" value={t?.attendanceRate ?? 0} decimals={1} suffix="%" icon={Clock3} tone="info" loading={thisMonth.isLoading} hint={`${t?.absent ?? 0} absent days`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr_0.95fr]">
        <SectionCard title="Attendance calendar">
          <AttendanceCalendar
            month={month}
            days={summary.data?.days}
            loading={summary.isLoading}
            onMonthChange={setMonth}
            timezone={tz}
            today={today.data?.workDate}
          />
        </SectionCard>

        <SectionCard
          title="Recent attendance"
          actions={
            <Button asChild variant="ghost" size="xs">
              <Link href="/employee/attendance/history">
                View all <ArrowRight />
              </Link>
            </Button>
          }
          bodyClassName="p-0"
        >
          {records.isLoading ? (
            <div className="grid gap-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : !records.data?.items.length ? (
            <EmptyState icon={Clock3} title="No attendance yet" description="Your check-ins will appear here." />
          ) : (
            <ul className="divide-y">
              {records.data.items.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-12 shrink-0 text-center">
                    <div className="text-[11px] text-muted-foreground uppercase">{fmtDate(r.workDate, { weekday: "short", month: undefined, day: undefined, year: undefined })}</div>
                    <div className="text-base font-semibold tabular">{r.workDate.slice(8)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium tabular">
                      {fmtTime(r.checkInAt, tz)} – {r.checkOutAt ? fmtTime(r.checkOutAt, tz) : "in progress"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.workedMinutes != null ? minutesToHuman(r.workedMinutes) : "Active"}
                      {r.isLate && ` · ${r.lateMinutes}m late`}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="grid content-start gap-6">
          <SectionCard
            title="Leave balance"
            description={`${new Date().getFullYear()} allocation`}
            actions={
              <Button asChild variant="ghost" size="xs">
                <Link href="/employee/leaves">Details</Link>
              </Button>
            }
          >
            <BalanceList balances={balances.data} loading={balances.isLoading} />
          </SectionCard>
          <SectionCard title="Pending requests" bodyClassName="p-0">
            {!pending.data?.items.length ? (
              <EmptyState icon={Inbox} title="No pending requests" className="py-8" />
            ) : (
              <ul className="divide-y">
                {pending.data.items.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">{l.leaveType?.name}</div>
                      <div className="text-xs text-muted-foreground tabular">
                        {fmtDate(l.startDate, { year: undefined })} – {fmtDate(l.endDate, { year: undefined })} · {l.days}d
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-warning">
                      <Hourglass className="size-3" /> Pending
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
