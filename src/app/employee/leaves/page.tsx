"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/shared/page-header";
import { BalanceList } from "@/components/leave/balance-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMyBalances, useMyLeaves } from "@/hooks/use-employee-data";
import { useGsapReveal } from "@/hooks/use-gsap-reveal";
import { api, errorMessage } from "@/lib/api-client";
import { fmtDate } from "@/lib/format";

export default function MyLeavesPage() {
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const balances = useMyBalances();
  const leaves = useMyLeaves({ page, status: status === "all" ? undefined : status });
  const qc = useQueryClient();
  const scope = useGsapReveal(!balances.isLoading);
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/leaves/${id}/cancel`),
    onSuccess: () => {
      toast.success("Leave request cancelled");
      qc.invalidateQueries({ queryKey: ["leaves"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div ref={scope} className="grid gap-6">
      <PageHeader
        title="My leave"
        description="Balances, requests and approval status."
        actions={
          <Button asChild>
            <Link href="/employee/leaves/apply">
              <CalendarPlus /> Apply for leave
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <SectionCard title="Balances" description={`${new Date().getFullYear()}`} className="h-fit">
          <BalanceList balances={balances.data} loading={balances.isLoading} />
        </SectionCard>

        <SectionCard
          title="Requests"
          actions={
            <Tabs
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <TabsList className="h-8">
                {["all", "PENDING", "APPROVED", "REJECTED"].map((s) => (
                  <TabsTrigger key={s} value={s} className="px-2.5 text-xs capitalize">
                    {s === "all" ? "All" : s.toLowerCase()}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          }
          bodyClassName="p-0"
        >
          {leaves.isLoading ? (
            <div className="grid gap-2 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : !leaves.data?.items.length ? (
            <EmptyState
              icon={CalendarDays}
              title="No leave requests"
              description="When you apply for leave, you can track its status here."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href="/employee/leaves/apply">Apply for leave</Link>
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead className="hidden md:table-cell">Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-5 text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaves.data.items.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="pl-5">
                        <span className="inline-flex items-center gap-2 font-medium">
                          <span className="size-2 rounded-full" style={{ background: l.leaveType?.color }} />
                          {l.leaveType?.name}
                        </span>
                      </TableCell>
                      <TableCell className="tabular">
                        {fmtDate(l.startDate)}
                        {l.endDate !== l.startDate && <> – {fmtDate(l.endDate)}</>}
                      </TableCell>
                      <TableCell className="tabular">{l.days}</TableCell>
                      <TableCell className="hidden max-w-[260px] md:table-cell">
                        <div className="truncate text-muted-foreground">{l.reason}</div>
                        {l.reviewComment && <div className="truncate text-xs">Admin: {l.reviewComment}</div>}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={l.status} />
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        {l.status === "PENDING" && (
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="xs">
                                Cancel
                              </Button>
                            }
                            title="Cancel this leave request?"
                            description="The request will be withdrawn and no longer appear for approval."
                            confirmLabel="Cancel request"
                            destructive
                            onConfirm={() => cancel.mutateAsync(l.id)}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination {...leaves.data} onPageChange={setPage} />
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
