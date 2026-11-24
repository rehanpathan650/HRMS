"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock3, Radar } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/shared/page-header";
import { PersonCell } from "@/components/shared/user-avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-badge";
import { AttendanceTable, type AdminAttendanceRow } from "@/components/admin/attendance-table";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { useNow } from "@/hooks/use-now";
import { api } from "@/lib/api-client";
import { durationClock, fmtTime, meters, todayYmd } from "@/lib/format";
import type { Paginated } from "@/lib/types";

function LiveBoard() {
  const now = useNow(1000);
  const { data: me } = useMe();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "attendance", "live"],
    queryFn: () => api.get<Paginated<AdminAttendanceRow>>("/admin/attendance", { open: "true", pageSize: 100, sort: "checkInAt", order: "asc" }),
    refetchInterval: 30_000,
  });
  if (isLoading) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  if (!data?.items.length) return <EmptyState icon={Radar} title="Nobody is checked in right now" description="Active sessions appear here in real time." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {data.items.map((r) => {
        const ci = r.evidence.find((e) => e.type === "CHECK_IN");
        return (
          <div key={r.id} className="rounded-lg border p-3.5 transition-colors hover:bg-muted/40">
            <div className="flex items-start justify-between gap-2">
              <PersonCell name={r.employee.name} src={r.employee.avatarUrl} subtitle={r.employee.department?.name} />
              <span className="relative mt-1 flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <div className="text-[11px] text-muted-foreground">Since {fmtTime(r.checkInAt, me?.company.timezone)}</div>
                <div className="text-lg font-semibold tabular">{durationClock(now - new Date(r.checkInAt).getTime())}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {r.isLate && <Pill tone="warning">{r.lateMinutes}m late</Pill>}
                {ci && !ci.withinGeofence && <Pill tone="danger">{meters(ci.distanceMeters)}</Pill>}
                {r.verificationStatus === "PENDING" && <Pill tone="warning">Review</Pill>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminAttendancePage() {
  const today = todayYmd();
  return (
    <div className="grid gap-6">
      <PageHeader title="Attendance" description="Live presence and every attendance record, with evidence." />
      <SectionCard title={<span className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-success" />Live — currently checked in</span>}>
        <LiveBoard />
      </SectionCard>
      <SectionCard title="Records" description="Filter, sort and open any record to inspect evidence" bodyClassName="p-0">
        <AttendanceTable initialRange={{ from: today, to: today }} />
      </SectionCard>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock3 className="size-3.5" /> Attendance records cannot be edited directly. Use verification to approve or reject them; every action is audited.
      </p>
    </div>
  );
}
