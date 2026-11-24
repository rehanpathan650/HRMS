"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, LoaderCircle, Pencil, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { PageHeader, SectionCard } from "@/components/shared/page-header";
import { Field, NativeSelect } from "@/components/shared/field";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge, Pill } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounce } from "@/hooks/use-debounce";
import { useLookups } from "@/hooks/use-me";
import { api, errorMessage } from "@/lib/api-client";
import { fmtDate, relativeTime } from "@/lib/format";
import { leaveTypeSchema } from "@/lib/validators/leave";
import type { LeaveRequest, Paginated } from "@/lib/types";

function ReviewDialog({ leave, decision, onClose }: { leave: LeaveRequest | null; decision: "APPROVE" | "REJECT"; onClose: () => void }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const m = useMutation({
    mutationFn: () => api.post(`/admin/leaves/${leave!.id}/review`, { decision, comment: comment || undefined }),
    onSuccess: () => {
      toast.success(decision === "APPROVE" ? "Leave approved" : "Leave rejected");
      qc.invalidateQueries({ queryKey: ["admin"] });
      setComment("");
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={!!leave} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{decision === "APPROVE" ? "Approve" : "Reject"} leave request</DialogTitle>
          <DialogDescription>
            {leave?.employee?.name} · {leave?.leaveType?.name} · {leave?.days} day(s), {fmtDate(leave?.startDate)} – {fmtDate(leave?.endDate)}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-muted/60 p-3 text-[13px]">
          <div className="text-xs text-muted-foreground">Reason</div>
          {leave?.reason}
        </div>
        <Field label="Comment (optional)" htmlFor="cmt">
          <Textarea id="cmt" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={decision === "REJECT" ? "Let them know why" : "Optional note"} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant={decision === "REJECT" ? "destructive" : "default"} onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending && <LoaderCircle className="animate-spin" />}
            {decision === "APPROVE" ? "Approve" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type LeaveType = z.infer<typeof leaveTypeSchema> & { id: string; requestCount: number };

function LeaveTypeDialog({ open, onClose, type }: { open: boolean; onClose: () => void; type?: LeaveType }) {
  const qc = useQueryClient();
  const form = useForm<z.input<typeof leaveTypeSchema>>({
    resolver: zodResolver(leaveTypeSchema),
    values: type ?? { name: "", code: "", description: "", defaultDays: 0, isPaid: true, color: "#10b981", isActive: true },
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (v) => {
    try {
      if (type) await api.patch(`/admin/leave-types/${type.id}`, v);
      else await api.post("/admin/leave-types", v);
      toast.success(type ? "Leave type updated" : "Leave type created");
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["leave-types"] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{type ? "Edit leave type" : "New leave type"}</DialogTitle>
          <DialogDescription>Default days are allocated to every employee each year.</DialogDescription>
        </DialogHeader>
        <form id="lt-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Name" htmlFor="ltn" error={e.name?.message}><Input id="ltn" {...form.register("name")} /></Field>
          <Field label="Code" htmlFor="ltc" error={e.code?.message}><Input id="ltc" {...form.register("code")} /></Field>
          <Field label="Days per year" htmlFor="ltd" error={e.defaultDays?.message}><Input id="ltd" type="number" step={0.5} {...form.register("defaultDays", { valueAsNumber: true })} /></Field>
          <Field label="Color" htmlFor="ltcol" error={e.color?.message}><Input id="ltcol" type="color" className="h-9 p-1" {...form.register("color")} /></Field>
          <Field label="Description" htmlFor="ltdesc" className="sm:col-span-2"><Input id="ltdesc" {...form.register("description")} /></Field>
          <label className="flex items-center justify-between rounded-lg border p-3 text-[13px] font-medium">Paid leave<Switch checked={form.watch("isPaid")} onCheckedChange={(c) => form.setValue("isPaid", c)} /></label>
          <label className="flex items-center justify-between rounded-lg border p-3 text-[13px] font-medium">Active<Switch checked={form.watch("isActive")} onCheckedChange={(c) => form.setValue("isActive", c)} /></label>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="lt-form" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting && <LoaderCircle className="animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminLeavesPage() {
  const [status, setStatus] = useState("PENDING");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [review, setReview] = useState<{ leave: LeaveRequest; decision: "APPROVE" | "REJECT" } | null>(null);
  const [typeDialog, setTypeDialog] = useState<{ open: boolean; type?: LeaveType }>({ open: false });
  const q = useDebounce(search);
  const lookups = useLookups();
  const params = { page, pageSize: 15, status: status === "ALL" ? undefined : status, search: q || undefined, leaveTypeId: typeFilter || undefined };
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "leaves", params],
    queryFn: () => api.get<Paginated<LeaveRequest> & { counts: Record<string, number> }>("/admin/leaves", params),
    placeholderData: (p) => p,
  });
  const types = useQuery({ queryKey: ["admin", "leave-types"], queryFn: () => api.get<LeaveType[]>("/admin/leave-types") });

  return (
    <div className="grid gap-6">
      <PageHeader title="Leave management" description="Review requests, configure leave types and allocations." />
      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Requests {data?.counts.PENDING ? <Pill tone="brand" className="ml-1.5">{data.counts.PENDING}</Pill> : null}</TabsTrigger>
          <TabsTrigger value="types">Leave types</TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="mt-4">
          <SectionCard bodyClassName="p-0">
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <TabsList className="h-8">
                  {["PENDING", "APPROVED", "REJECTED", "CANCELLED", "ALL"].map((s) => (
                    <TabsTrigger key={s} value={s} className="px-2.5 text-xs capitalize">
                      {s.toLowerCase()}
                      {s !== "ALL" && data?.counts[s] ? <span className="ml-1 text-muted-foreground tabular">{data.counts[s]}</span> : null}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="relative ml-auto w-full sm:w-56">
                <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-8 pl-8 text-[13px]" placeholder="Search employee…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <NativeSelect value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="h-8 w-auto text-xs" aria-label="Leave type">
                <option value="">All types</option>
                {lookups.data?.leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </NativeSelect>
            </div>
            {isLoading ? (
              <div className="grid gap-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : !data?.items.length ? (
              <EmptyState icon={CalendarDays} title={status === "PENDING" ? "No pending requests" : "No requests"} description={status === "PENDING" ? "You're all caught up." : undefined} />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead className="hidden lg:table-cell">Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="pr-4 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="pl-4">
                          <div className="text-[13px] font-medium">{l.employee?.name}</div>
                          <div className="text-xs text-muted-foreground">{l.employee?.department ?? l.employee?.employeeCode} · {relativeTime(l.createdAt)}</div>
                        </TableCell>
                        <TableCell><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: l.leaveType?.color }} />{l.leaveType?.name}</span></TableCell>
                        <TableCell className="whitespace-nowrap tabular">{fmtDate(l.startDate, { year: undefined })}{l.endDate !== l.startDate && ` – ${fmtDate(l.endDate, { year: undefined })}`}</TableCell>
                        <TableCell className="tabular">{l.days}{l.halfDay && " (½)"}</TableCell>
                        <TableCell className="hidden max-w-[280px] lg:table-cell">
                          <div className="truncate text-muted-foreground" title={l.reason}>{l.reason}</div>
                          {l.reviewComment && <div className="truncate text-xs">“{l.reviewComment}” — {l.reviewer}</div>}
                        </TableCell>
                        <TableCell><StatusBadge status={l.status} /></TableCell>
                        <TableCell className="pr-4 text-right">
                          {l.status === "PENDING" ? (
                            <div className="flex justify-end gap-1.5">
                              <Button size="icon-sm" variant="outline" aria-label="Reject" className="text-danger" onClick={() => setReview({ leave: l, decision: "REJECT" })}><X /></Button>
                              <Button size="icon-sm" aria-label="Approve" onClick={() => setReview({ leave: l, decision: "APPROVE" })}><Check /></Button>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">{l.reviewedAt ? relativeTime(l.reviewedAt) : "—"}</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Pagination {...data} onPageChange={setPage} />
              </>
            )}
          </SectionCard>
        </TabsContent>
        <TabsContent value="types" className="mt-4">
          <SectionCard title="Leave types" description="Per-employee balances can be adjusted on each employee's profile." actions={<Button size="sm" onClick={() => setTypeDialog({ open: true })}><Plus /> New type</Button>} bodyClassName="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Days / year</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Requests</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.data?.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="pl-4 font-medium"><span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: t.color }} />{t.name}</span></TableCell>
                    <TableCell className="font-mono text-xs">{t.code}</TableCell>
                    <TableCell className="tabular">{t.defaultDays}</TableCell>
                    <TableCell>{t.isPaid ? "Paid" : "Unpaid"}</TableCell>
                    <TableCell className="tabular">{t.requestCount}</TableCell>
                    <TableCell><StatusBadge status={t.isActive ? "ACTIVE" : "INACTIVE"} /></TableCell>
                    <TableCell className="pr-4 text-right"><Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => setTypeDialog({ open: true, type: t })}><Pencil /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        </TabsContent>
      </Tabs>
      <ReviewDialog leave={review?.leave ?? null} decision={review?.decision ?? "APPROVE"} onClose={() => setReview(null)} />
      <LeaveTypeDialog open={typeDialog.open} type={typeDialog.type} onClose={() => setTypeDialog({ open: false })} />
    </div>
  );
}
