"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/shared/page-header";
import { PersonCell } from "@/components/shared/user-avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-badge";
import { Pagination } from "@/components/shared/pagination";
import { AttendanceDetail } from "@/components/admin/attendance-detail";
import type { AdminAttendanceRow } from "@/components/admin/attendance-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api-client";
import { fmtDate, fmtTime } from "@/lib/format";
import { ATTENDANCE_FLAG_LABELS } from "@/lib/constants";
import type { Paginated } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function VerificationPage() {
  const [tab, setTab] = useState("PENDING");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(true);
  const { data: me } = useMe();
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const f = () => setIsDesktop(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);

  const params =
    tab === "PENDING"
      ? { verification: "PENDING", sort: "riskScore", order: "desc" }
      : tab === "FLAGGED"
        ? { flagged: "true", sort: "checkInAt", order: "desc" }
        : { verification: tab, sort: "checkInAt", order: "desc" };
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "attendance", "verification", tab, page],
    queryFn: () => api.get<Paginated<AdminAttendanceRow>>("/admin/attendance", { ...params, page, pageSize: 12 }),
    placeholderData: (p) => p,
  });

  useEffect(() => {
    if (isDesktop && data?.items.length && !data.items.some((i) => i.id === selected)) setSelected(data.items[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isDesktop]);

  const list = (
    <SectionCard
      bodyClassName="p-0"
      title="Queue"
      actions={
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); setSelected(null); }}>
          <TabsList className="h-8">
            <TabsTrigger value="PENDING" className="px-2 text-xs">Pending</TabsTrigger>
            <TabsTrigger value="FLAGGED" className="px-2 text-xs">Flagged</TabsTrigger>
            <TabsTrigger value="APPROVED" className="px-2 text-xs">Approved</TabsTrigger>
            <TabsTrigger value="REJECTED" className="px-2 text-xs">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {isLoading ? (
        <div className="grid gap-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : !data?.items.length ? (
        <EmptyState icon={ShieldCheck} title={tab === "PENDING" ? "Queue is clear" : "Nothing here"} description={tab === "PENDING" ? "No attendance records need review right now." : undefined} />
      ) : (
        <>
          <ul className="divide-y">
            {data.items.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelected(r.id)}
                  className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50", selected === r.id && "bg-muted/70")}
                >
                  <div className="min-w-0 flex-1">
                    <PersonCell name={r.employee.name} src={r.employee.avatarUrl} subtitle={`${fmtDate(r.workDate, { year: undefined, weekday: "short" })} · ${fmtTime(r.checkInAt, me?.company.timezone)}`} />
                    <div className="mt-1.5 flex flex-wrap gap-1 pl-[42px]">
                      {r.flags.slice(0, 3).map((f) => <Pill key={f} tone="warning">{ATTENDANCE_FLAG_LABELS[f] ?? f}</Pill>)}
                      {!r.flags.length && <Pill>Manual review</Pill>}
                    </div>
                  </div>
                  <span className={cn("text-xs font-semibold tabular", r.riskScore >= 40 ? "text-danger" : "text-warning")}>{r.riskScore}</span>
                </button>
              </li>
            ))}
          </ul>
          <Pagination {...data} onPageChange={setPage} />
        </>
      )}
    </SectionCard>
  );

  return (
    <div className="grid gap-6">
      <PageHeader title="Attendance verification" description="Review selfies, GPS evidence and geofence results. Every decision is written to the audit log." />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {list}
        {isDesktop && (
          <SectionCard title="Evidence" className="h-fit">
            {selected ? (
              <AttendanceDetail key={selected} id={selected} onReviewed={() => setSelected(null)} />
            ) : (
              <EmptyState icon={ShieldCheck} title="Select a record" description="Choose a record from the queue to review its evidence." />
            )}
          </SectionCard>
        )}
      </div>
      {!isDesktop && (
        <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <SheetContent className="w-full overflow-y-auto">
            <SheetHeader className="px-5 pt-5">
              <SheetTitle>Evidence</SheetTitle>
              <SheetDescription>Approve or reject this record.</SheetDescription>
            </SheetHeader>
            <div className="px-5 pb-6">{selected && <AttendanceDetail id={selected} onReviewed={() => setSelected(null)} />}</div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
