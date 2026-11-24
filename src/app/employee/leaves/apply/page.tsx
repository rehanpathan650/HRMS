"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { PageHeader, SectionCard } from "@/components/shared/page-header";
import { Field } from "@/components/shared/field";
import { BalanceList } from "@/components/leave/balance-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { applyLeaveSchema } from "@/lib/validators/leave";
import { api, errorMessage, newIdempotencyKey } from "@/lib/api-client";
import { useMyBalances } from "@/hooks/use-employee-data";
import { fmtDate, todayYmd } from "@/lib/format";
import { cn } from "@/lib/utils";

type Values = z.input<typeof applyLeaveSchema>;

function weekdaysBetween(from: string, to: string) {
  if (!from || !to || to < from) return 0;
  let n = 0;
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

export default function ApplyLeavePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const idem = useRef(newIdempotencyKey());
  const types = useQuery({
    queryKey: ["leave-types"],
    queryFn: () => api.get<{ id: string; name: string; color: string; isPaid: boolean; description: string | null }[]>("/leave-types"),
  });
  const balances = useMyBalances();
  const form = useForm<Values>({
    resolver: zodResolver(applyLeaveSchema),
    defaultValues: { leaveTypeId: "", startDate: todayYmd(), endDate: todayYmd(), halfDay: false, reason: "" },
  });
  const v = form.watch();
  const estimate = v.halfDay ? 0.5 : weekdaysBetween(v.startDate, v.endDate);
  const selectedBalance = useMemo(() => balances.data?.find((b) => b.leaveType.id === v.leaveTypeId), [balances.data, v.leaveTypeId]);
  const insufficient = selectedBalance?.leaveType.isPaid && estimate > selectedBalance.available;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await api.post("/leaves", values, { idempotencyKey: idem.current });
      toast.success("Leave request submitted for approval");
      qc.invalidateQueries({ queryKey: ["leaves"] });
      router.push("/employee/leaves");
    } catch (e) {
      idem.current = newIdempotencyKey();
      toast.error(errorMessage(e));
    }
  });

  const errors = form.formState.errors;

  return (
    <div className="grid gap-6">
      <PageHeader title="Apply for leave" description="Your request goes to an administrator for approval." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <SectionCard>
          <form onSubmit={onSubmit} className="grid gap-5" noValidate>
            <Field label="Leave type" htmlFor="type" error={errors.leaveTypeId?.message && "Select a leave type"}>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" id="type">
                {types.data?.map((t) => (
                  <label
                    key={t.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50",
                      v.leaveTypeId === t.id && "border-foreground/60 bg-muted/60 ring-1 ring-foreground/10",
                    )}
                  >
                    <input type="radio" value={t.id} className="sr-only" {...form.register("leaveTypeId")} />
                    <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{t.name}</span>
                      <span className="block text-xs text-muted-foreground">{t.description ?? (t.isPaid ? "Paid" : "Unpaid")}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date" htmlFor="start" error={errors.startDate?.message}>
                <Input
                  id="start"
                  type="date"
                  {...form.register("startDate", {
                    onChange: (e) => {
                      if (form.getValues("endDate") < e.target.value || form.getValues("halfDay")) form.setValue("endDate", e.target.value);
                    },
                  })}
                />
              </Field>
              <Field label="End date" htmlFor="end" error={errors.endDate?.message}>
                <Input id="end" type="date" min={v.startDate} disabled={v.halfDay} {...form.register("endDate")} />
              </Field>
            </div>

            <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <span>
                <span className="block text-[13px] font-medium">Half day</span>
                <span className="block text-xs text-muted-foreground">Request half of a single working day.</span>
              </span>
              <Switch
                checked={v.halfDay}
                onCheckedChange={(c) => {
                  form.setValue("halfDay", c);
                  if (c) form.setValue("endDate", form.getValues("startDate"));
                }}
              />
            </label>

            <Field label="Reason" htmlFor="reason" error={errors.reason?.message}>
              <Textarea id="reason" rows={4} placeholder="Briefly describe the reason for your leave" maxLength={1000} {...form.register("reason")} />
            </Field>

            <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-[13px]">
                <CalendarRange className="size-4 text-muted-foreground" />
                <span className="font-medium tabular">{estimate} working day{estimate === 1 ? "" : "s"}</span>
                <span className="text-muted-foreground">
                  {fmtDate(v.startDate, { year: undefined })}
                  {v.endDate !== v.startDate && ` – ${fmtDate(v.endDate, { year: undefined })}`}
                </span>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting || !!insufficient}>
                  {form.formState.isSubmitting && <LoaderCircle className="animate-spin" />}
                  Submit request
                </Button>
              </div>
            </div>
            {insufficient && (
              <p className="-mt-2 text-right text-xs text-danger">
                Only {selectedBalance!.available} day(s) of {selectedBalance!.leaveType.name} available.
              </p>
            )}
          </form>
        </SectionCard>
        <SectionCard title="Your balances" className="h-fit">
          <BalanceList balances={balances.data} loading={balances.isLoading} />
          <p className="mt-5 text-xs text-muted-foreground">
            Weekends and non-working days in your schedule aren&apos;t counted. Overlapping requests are not allowed.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
