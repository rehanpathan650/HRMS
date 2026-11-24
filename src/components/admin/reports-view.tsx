"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/shared/page-header";
import { DateRangeFilter, presets, type Range } from "@/components/shared/date-range";
import { NativeSelect } from "@/components/shared/field";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLookups } from "@/hooks/use-me";
import { api, buildQuery } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface Report {
  type: string;
  title: string;
  from: string;
  to: string;
  columns: { key: string; label: string; type?: string }[];
  rows: Record<string, string | number | null>[];
}

export const ALL_TYPES = [
  { v: "attendance", l: "Attendance register", d: "Every check-in and check-out" },
  { v: "employee", l: "Employee-wise", d: "Per-employee totals and rates" },
  { v: "department", l: "Department-wise", d: "Aggregated by department" },
  { v: "late", l: "Late arrivals", d: "Check-ins after the grace period" },
  { v: "hours", l: "Working hours", d: "Totals, averages and overtime" },
  { v: "leave", l: "Leave", d: "Requests overlapping the period" },
];

const STATUS_COLS = new Set(["status", "verification"]);

export function ReportsView({ exclude = [], defaultPreset = "month" }: { exclude?: string[]; defaultPreset?: "today" | "week" | "month" }) {
  const types = ALL_TYPES.filter((t) => !exclude.includes(t.v));
  const [type, setType] = useState(types[0].v);
  const [range, setRange] = useState<Range>(() => {
    const p = presets()[defaultPreset];
    return { from: p.from, to: p.to };
  });
  const [dept, setDept] = useState("");
  const [employee, setEmployee] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const lookups = useLookups();
  const params = { type, from: range.from, to: range.to, departmentId: dept || undefined, employeeId: employee || undefined };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "report", params],
    queryFn: () => api.get<Report>("/admin/reports", params),
    placeholderData: (p) => p,
  });

  const download = async (format: "csv" | "xlsx") => {
    setDownloading(format);
    try {
      const res = await fetch(`/api/admin/reports${buildQuery({ ...params, format })}`, { credentials: "same-origin" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendly-${type}-${range.from}_${range.to}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${format.toUpperCase()}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(null);
    }
  };

  const fmt = (v: unknown, t?: string) => {
    if (v == null || v === "") return <span className="text-muted-foreground">—</span>;
    if (t === "percent") return `${v}%`;
    if (t === "hours") return `${v}h`;
    return String(v);
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {types.map((t) => (
          <button
            key={t.v}
            onClick={() => setType(t.v)}
            className={cn(
              "rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50",
              type === t.v && "border-foreground/60 ring-1 ring-foreground/10",
            )}
          >
            <div className="text-[13px] font-medium">{t.l}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{t.d}</div>
          </button>
        ))}
      </div>

      <SectionCard
        title={data?.title ?? "Report"}
        description={data ? `${data.rows.length.toLocaleString()} rows · ${data.from} → ${data.to}` : undefined}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => download("csv")} disabled={!!downloading || !data?.rows.length}>
              {downloading === "csv" ? <LoaderCircle className="animate-spin" /> : <FileText />} CSV
            </Button>
            <Button size="sm" onClick={() => download("xlsx")} disabled={!!downloading || !data?.rows.length}>
              {downloading === "xlsx" ? <LoaderCircle className="animate-spin" /> : <FileSpreadsheet />} Excel
            </Button>
          </>
        }
        bodyClassName="p-0"
      >
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <NativeSelect value={dept} onChange={(e) => setDept(e.target.value)} className="h-8 w-auto text-xs" aria-label="Department">
              <option value="">All departments</option>
              {lookups.data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </NativeSelect>
            <NativeSelect value={employee} onChange={(e) => setEmployee(e.target.value)} className="h-8 w-auto max-w-[220px] text-xs" aria-label="Employee">
              <option value="">All employees</option>
              {lookups.data?.employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.employeeCode})</option>)}
            </NativeSelect>
          </div>
          <DateRangeFilter value={range} onChange={setRange} presetKeys={["today", "week", "month", "lastMonth"]} />
        </div>
        <div className={cn("max-h-[620px] overflow-auto transition-opacity", isFetching && "opacity-70")}>
          {isLoading ? (
            <div className="grid gap-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
          ) : !data?.rows.length ? (
            <EmptyState icon={Download} title="No data for this period" description="Adjust the date range or filters." />
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  {data.columns.map((c, i) => (
                    <TableHead key={c.key} className={cn("whitespace-nowrap", i === 0 && "pl-4", ["number", "hours", "percent"].includes(c.type ?? "") && "text-right")}>
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.slice(0, 500).map((r, idx) => (
                  <TableRow key={idx}>
                    {data.columns.map((c, i) => (
                      <TableCell
                        key={c.key}
                        className={cn("whitespace-nowrap text-[13px]", i === 0 && "pl-4", ["number", "hours", "percent"].includes(c.type ?? "") && "text-right tabular", c.key === "reason" && "max-w-[260px] truncate")}
                      >
                        {STATUS_COLS.has(c.key) && r[c.key] ? <StatusBadge status={String(r[c.key])} /> : fmt(r[c.key], c.type)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        {data && data.rows.length > 500 && (
          <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">Showing the first 500 rows. Export to see all {data.rows.length.toLocaleString()}.</div>
        )}
      </SectionCard>
    </div>
  );
}
