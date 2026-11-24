"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Clock3, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NativeSelect } from "@/components/shared/field";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { PersonCell } from "@/components/shared/user-avatar";
import { StatusBadge, Pill } from "@/components/shared/status-badge";
import { DateRangeFilter, type Range } from "@/components/shared/date-range";
import { AttendanceDetail } from "./attendance-detail";
import { useDebounce } from "@/hooks/use-debounce";
import { useLookups, useMe } from "@/hooks/use-me";
import { api } from "@/lib/api-client";
import { fmtDate, fmtTime, meters, minutesToHuman } from "@/lib/format";
import type { AttendanceRecord, Paginated } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface AdminAttendanceRow extends AttendanceRecord {
  evidence: { type: string; distanceMeters: number | null; withinGeofence: boolean; accuracyMeters: number }[];
  employee: { id: string; name: string; employeeCode: string; designation: string; department: { name: string; color: string } | null; avatarUrl: string | null };
}

type SortKey = "workDate" | "checkInAt" | "workedMinutes" | "riskScore" | "lateMinutes";

export function AttendanceTable({
  initialRange,
  employeeId,
  showRange = true,
  pageSize = 15,
  open,
}: {
  initialRange: Range;
  employeeId?: string;
  showRange?: boolean;
  pageSize?: number;
  open?: boolean;
}) {
  const [range, setRange] = useState(initialRange);
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; order: "asc" | "desc" }>({ key: "checkInAt", order: "desc" });
  const [selected, setSelected] = useState<string | null>(null);
  const q = useDebounce(search, 300);
  const lookups = useLookups(!employeeId);
  const { data: me } = useMe();
  const tz = me?.company.timezone;

  const params = {
    page,
    pageSize,
    from: range.from,
    to: range.to,
    search: q || undefined,
    departmentId: dept || undefined,
    status: status || undefined,
    employeeId,
    sort: sort.key,
    order: sort.order,
    open: open ? "true" : undefined,
  };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "attendance", "list", params],
    queryFn: () => api.get<Paginated<AdminAttendanceRow>>("/admin/attendance", params),
    placeholderData: (p) => p,
  });

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, order: s.order === "asc" ? "desc" : "asc" } : { key, order: "desc" }));
    setPage(1);
  };
  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(k)}>
        {children}
        {sort.key === k && (sort.order === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </TableHead>
  );

  return (
    <div>
      <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {!employeeId && (
            <div className="relative w-full sm:w-60">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search employee…"
                className="h-8 pl-8 text-[13px]"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          )}
          {!employeeId && (
            <NativeSelect value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }} className="h-8 w-auto text-xs" aria-label="Department">
              <option value="">All departments</option>
              {lookups.data?.departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </NativeSelect>
          )}
          <NativeSelect value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-8 w-auto text-xs" aria-label="Status">
            <option value="">All statuses</option>
            <option value="PRESENT">Present</option>
            <option value="LATE">Late</option>
            <option value="HALF_DAY">Half day</option>
            <option value="PENDING_VERIFICATION">Pending review</option>
            <option value="REJECTED">Rejected</option>
          </NativeSelect>
        </div>
        {showRange && <DateRangeFilter value={range} onChange={(r) => { setRange(r); setPage(1); }} />}
      </div>

      <div className={cn("transition-opacity", isFetching && !isLoading && "opacity-70")}>
        {isLoading ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11" />)}
          </div>
        ) : !data?.items.length ? (
          <EmptyState icon={Clock3} title="No attendance records" description="Nothing matches these filters." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {!employeeId && <TableHead className="pl-4">Employee</TableHead>}
                  <SortHead k="workDate" className={employeeId ? "pl-4" : undefined}>Date</SortHead>
                  <SortHead k="checkInAt">In</SortHead>
                  <TableHead>Out</TableHead>
                  <SortHead k="workedMinutes">Hours</SortHead>
                  <SortHead k="lateMinutes" className="hidden md:table-cell">Late</SortHead>
                  <TableHead className="hidden xl:table-cell">Location</TableHead>
                  <SortHead k="riskScore" className="hidden lg:table-cell">Risk</SortHead>
                  <TableHead className="pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((r) => {
                  const ci = r.evidence.find((e) => e.type === "CHECK_IN");
                  return (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r.id)}>
                      {!employeeId && (
                        <TableCell className="pl-4">
                          <PersonCell name={r.employee.name} src={r.employee.avatarUrl} subtitle={r.employee.department?.name ?? r.employee.employeeCode} />
                        </TableCell>
                      )}
                      <TableCell className={cn("whitespace-nowrap", employeeId && "pl-4")}>{fmtDate(r.workDate, { year: undefined, weekday: "short" })}</TableCell>
                      <TableCell className="tabular">{fmtTime(r.checkInAt, tz)}</TableCell>
                      <TableCell className="tabular">{r.checkOutAt ? fmtTime(r.checkOutAt, tz) : <Pill tone="success">Active</Pill>}</TableCell>
                      <TableCell className="tabular">{minutesToHuman(r.workedMinutes)}</TableCell>
                      <TableCell className="hidden tabular md:table-cell">{r.isLate ? `${r.lateMinutes}m` : "—"}</TableCell>
                      <TableCell className="hidden text-xs xl:table-cell">
                        {ci ? (
                          <span className={ci.withinGeofence ? "text-muted-foreground" : "text-danger"}>
                            {meters(ci.distanceMeters)} · ±{meters(ci.accuracyMeters)}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className={cn("text-xs font-medium tabular", r.riskScore >= 40 ? "text-danger" : r.riskScore > 0 ? "text-warning" : "text-muted-foreground")}>
                          {r.riskScore}
                        </span>
                      </TableCell>
                      <TableCell className="pr-4"><StatusBadge status={r.status} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pagination {...data} onPageChange={setPage} />
          </>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[560px]">
          <SheetHeader className="px-5 pt-5">
            <SheetTitle>Attendance record</SheetTitle>
            <SheetDescription>Evidence, location and review history.</SheetDescription>
          </SheetHeader>
          <div className="px-5 pb-6">{selected && <AttendanceDetail id={selected} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
