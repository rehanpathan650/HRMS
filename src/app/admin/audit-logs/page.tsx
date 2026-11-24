"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ScrollText, Search } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/shared/page-header";
import { NativeSelect } from "@/components/shared/field";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRangeFilter, presets, type Range } from "@/components/shared/date-range";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounce } from "@/hooks/use-debounce";
import { api } from "@/lib/api-client";
import { fmtDateTime } from "@/lib/format";
import type { Paginated } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Log {
  id: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

const tone = (a: string) =>
  /reject|delete|deactivate|failed/.test(a) ? "text-danger bg-danger-soft" : /approve|create|login$/.test(a) ? "text-success bg-success-soft" : /update|reset|change/.test(a) ? "text-warning bg-warning-soft" : "text-muted-foreground bg-muted";

export default function AuditLogsPage() {
  const [range, setRange] = useState<Range>(() => ({ from: presets().last30.from, to: presets().last30.to }));
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const q = useDebounce(search);
  const params = { page, pageSize: 25, search: q || undefined, action: action || undefined, from: range.from, to: range.to };
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "audit", params],
    queryFn: () => api.get<Paginated<Log> & { actions: string[] }>("/admin/audit-logs", params),
    placeholderData: (p) => p,
  });

  return (
    <div className="grid gap-6">
      <PageHeader title="Audit logs" description="Append-only record of security and administrative events. Entries cannot be edited or deleted." />
      <SectionCard bodyClassName="p-0">
        <div className="flex flex-col gap-2 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-8 pl-8 text-[13px]" placeholder="Search actor, action, entity ID…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <NativeSelect value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="h-8 w-auto text-xs" aria-label="Action">
              <option value="">All actions</option>
              {data?.actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </NativeSelect>
          </div>
          <DateRangeFilter value={range} onChange={(r) => { setRange(r); setPage(1); }} presetKeys={["today", "week", "last30"]} />
        </div>
        {isLoading ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : !data?.items.length ? (
          <EmptyState icon={ScrollText} title="No audit events" description="Nothing matches these filters." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 pl-4" />
                  <TableHead>Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="hidden md:table-cell">Entity</TableHead>
                  <TableHead className="hidden pr-4 lg:table-cell">IP address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((l) => (
                  <Fragment key={l.id}>
                    <TableRow className="cursor-pointer" onClick={() => setOpen(open === l.id ? null : l.id)}>
                      <TableCell className="pl-4"><ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", open === l.id && "rotate-90")} /></TableCell>
                      <TableCell className="whitespace-nowrap tabular">{fmtDateTime(l.createdAt)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{l.actorEmail ?? <span className="text-muted-foreground">system</span>}</TableCell>
                      <TableCell><span className={cn("rounded px-1.5 py-0.5 font-mono text-[11.5px]", tone(l.action))}>{l.action}</span></TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{l.entityType}{l.entityId && <span className="font-mono"> · {l.entityId.slice(0, 10)}…</span>}</TableCell>
                      <TableCell className="hidden pr-4 font-mono text-xs text-muted-foreground lg:table-cell">{l.ipAddress ?? "—"}</TableCell>
                    </TableRow>
                    {open === l.id && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="bg-muted/40 px-4 py-3">
                          <div className="grid gap-2 text-xs">
                            <div><span className="text-muted-foreground">Entity ID: </span><span className="font-mono">{l.entityId ?? "—"}</span></div>
                            <div className="truncate"><span className="text-muted-foreground">User agent: </span>{l.userAgent ?? "—"}</div>
                            <pre className="max-h-64 overflow-auto rounded-md border bg-card p-3 font-mono text-[11.5px] whitespace-pre-wrap">{JSON.stringify(l.metadata ?? {}, null, 2)}</pre>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            <Pagination {...data} onPageChange={setPage} />
          </>
        )}
      </SectionCard>
    </div>
  );
}
