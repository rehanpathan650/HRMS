"use client";

import { useState } from "react";
import { CalendarCheck, CalendarX, Clock3, History, Timer, TriangleAlert } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge, Pill } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { DateRangeFilter, presets, type Range } from "@/components/shared/date-range";
import { AttendanceCalendar } from "@/components/attendance/attendance-calendar";
import { useToday } from "@/components/attendance/attendance-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect } from "@/components/shared/field";
import { useMyRecords, useMySummary } from "@/hooks/use-employee-data";
import { useGsapReveal } from "@/hooks/use-gsap-reveal";
import { fmtDate, fmtTime, meters, minutesToHuman } from "@/lib/format";
import { ATTENDANCE_FLAG_LABELS } from "@/lib/constants";

export default function AttendanceHistoryPage() {
  const [range, setRange] = useState<Range>(() => {
    const m = presets().month;
    return { from: m.from, to: m.to };
  });
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const today = useToday();
  const tz = today.data?.timezone;
  const summary = useMySummary(range.from, range.to);
  const records = useMyRecords({ page, from: range.from, to: range.to, status: status || undefined, pageSize: 12 });
  const scope = useGsapReveal(!summary.isLoading);
  const t = summary.data?.totals;

  return (
    <div ref={scope} className="grid gap-6">
      <PageHeader
        title="Attendance history"
        description="Your check-ins, working hours, late arrivals and early departures."
        actions={
          <DateRangeFilter
            value={range}
            onChange={(r) => {
              setRange(r);
              setPage(1);
            }}
            presetKeys={["week", "month", "lastMonth", "last30"]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Present" value={t?.present ?? 0} icon={CalendarCheck} tone="success" loading={summary.isLoading} />
        <StatCard label="Absent" value={t?.absent ?? 0} icon={CalendarX} tone="danger" loading={summary.isLoading} />
        <StatCard label="Late arrivals" value={t?.late ?? 0} icon={TriangleAlert} tone="warning" loading={summary.isLoading} />
        <StatCard label="Early departures" value={t?.earlyDepartures ?? 0} icon={Clock3} tone="info" loading={summary.isLoading} />
        <StatCard
          label="Hours worked"
          value={(t?.workedMinutes ?? 0) / 60}
          decimals={1}
          suffix="h"
          icon={Timer}
          tone="brand"
          loading={summary.isLoading}
          hint={`avg ${minutesToHuman(t?.avgWorkedMinutes ?? 0)}/day`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <SectionCard
          title="Records"
          actions={
            <NativeSelect
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-8 w-40 text-xs"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="PRESENT">Present</option>
              <option value="LATE">Late</option>
              <option value="HALF_DAY">Half day</option>
              <option value="PENDING_VERIFICATION">Pending review</option>
              <option value="REJECTED">Rejected</option>
            </NativeSelect>
          }
          bodyClassName="p-0"
        >
          {records.isLoading ? (
            <div className="grid gap-2 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : !records.data?.items.length ? (
            <EmptyState icon={History} title="No records in this period" description="Try a different date range or status." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Date</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Check-out</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead className="hidden md:table-cell">Late / early</TableHead>
                    <TableHead className="hidden lg:table-cell">Location</TableHead>
                    <TableHead className="pr-5">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.data.items.map((r) => {
                    const ci = r.evidence.find((e) => e.type === "CHECK_IN");
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="pl-5 font-medium">{fmtDate(r.workDate, { weekday: "short" })}</TableCell>
                        <TableCell className="tabular">{fmtTime(r.checkInAt, tz)}</TableCell>
                        <TableCell className="tabular">{r.checkOutAt ? fmtTime(r.checkOutAt, tz) : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="tabular">{minutesToHuman(r.workedMinutes)}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex gap-1">
                            {r.isLate && <Pill tone="warning">{r.lateMinutes}m late</Pill>}
                            {r.isEarlyDeparture && <Pill tone="info">{r.earlyMinutes}m early</Pill>}
                            {!r.isLate && !r.isEarlyDeparture && <span className="text-muted-foreground">—</span>}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {ci ? (
                            <span className="text-xs text-muted-foreground">
                              {ci.withinGeofence ? "In office" : "Outside"} · {meters(ci.distanceMeters)}
                            </span>
                          ) : (
                            "—"
                          )}
                          {r.flags.length > 0 && (
                            <div className="mt-0.5 text-[11px] text-warning">{r.flags.map((f) => ATTENDANCE_FLAG_LABELS[f] ?? f).join(", ")}</div>
                          )}
                        </TableCell>
                        <TableCell className="pr-5">
                          <StatusBadge status={r.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination {...records.data} onPageChange={setPage} />
            </>
          )}
        </SectionCard>

        <SectionCard title="Calendar">
          <AttendanceCalendar month={range.from} days={summary.data?.days} loading={summary.isLoading} timezone={tz} today={today.data?.workDate} />
        </SectionCard>
      </div>
    </div>
  );
}
