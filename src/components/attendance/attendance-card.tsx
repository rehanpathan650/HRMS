"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarCheck, Clock3, Coffee, LogIn, LogOut, MapPin, Plane, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { ErrorState } from "@/components/shared/empty-state";
import { AttendanceFlow } from "./attendance-flow";
import { useNow } from "@/hooks/use-now";
import { api } from "@/lib/api-client";
import { durationClock, fmtTime, minutesToHuman } from "@/lib/format";
import type { TodayState } from "@/lib/types";
import { cn } from "@/lib/utils";

export function useToday() {
  return useQuery({
    queryKey: ["attendance", "today"],
    queryFn: async () => {
      const t0 = Date.now();
      const data = await api.get<TodayState>("/attendance/today");
      // Offset between server and client clocks, so the live timer uses server time.
      const offset = new Date(data.serverTime).getTime() - (t0 + Date.now()) / 2;
      return { ...data, clockOffset: offset };
    },
    refetchInterval: 5 * 60_000,
  });
}

function ProgressRing({ value, size = 168 }: { value: number; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--muted)" strokeWidth={stroke} fill="none" />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="var(--brand)"
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - pct) }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

export function AttendanceCard({ className }: { className?: string }) {
  const { data, isLoading, isError, refetch } = useToday();
  const [flow, setFlow] = useState<null | "check-in" | "check-out">(null);
  const now = useNow(1000);

  const serverNow = now + (data?.clockOffset ?? 0);
  const a = data?.attendance;
  const elapsedMs = a && !a.checkOutAt ? serverNow - new Date(a.checkInAt).getTime() : 0;
  const scheduledMs = (data?.schedule.scheduledMinutes ?? 480) * 60_000;
  const breakMs = (data?.schedule.breakMinutes ?? 0) * 60_000;
  const netMs = Math.max(0, elapsedMs - (elapsedMs >= 5 * 3600_000 ? breakMs : 0));
  const remainingMs = Math.max(0, scheduledMs - netMs);

  const clock = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: data?.timezone }).format(
        new Date(serverNow),
      ),
    [serverNow, data?.timezone],
  );

  if (isLoading) {
    return (
      <div className={cn("rounded-2xl bg-card p-6 card-elevated", className)}>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className={cn("rounded-2xl bg-card p-6 card-elevated", className)}>
        <ErrorState message="Couldn't load today's attendance." onRetry={() => refetch()} />
      </div>
    );
  }

  const state = data.state;

  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-card card-elevated", className)} data-reveal>
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" />
      <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-center">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-muted-foreground">Today&apos;s attendance</span>
            {a ? (
              <StatusBadge status={a.status} />
            ) : state === "ON_LEAVE" ? (
              <StatusBadge status="ON_LEAVE" />
            ) : (
              <StatusBadge status="UPCOMING" label={data.schedule.isWorkDay ? "Not checked in" : "Day off"} />
            )}
          </div>
          <div className="mt-2 text-4xl font-semibold tracking-tight tabular sm:text-5xl" aria-live="off">
            {clock}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-3.5" />
              {data.schedule.name}: {fmtTime(data.schedule.start, data.timezone)} – {fmtTime(data.schedule.end, data.timezone)}
            </span>
            {data.office && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {data.office.name} · {data.office.radiusMeters} m radius
              </span>
            )}
          </div>

          {state === "CHECKED_IN" && a && (
            <dl className="mt-6 grid grid-cols-3 gap-3 sm:max-w-md">
              <div>
                <dt className="text-xs text-muted-foreground">Checked in</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular">{fmtTime(a.checkInAt, data.timezone)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Worked</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular">{minutesToHuman(netMs / 60_000)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Remaining</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular">{minutesToHuman(remainingMs / 60_000)}</dd>
              </div>
            </dl>
          )}

          {state === "COMPLETED" && a && (
            <dl className="mt-6 grid grid-cols-3 gap-3 sm:max-w-md">
              <div>
                <dt className="text-xs text-muted-foreground">Check-in</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular">{fmtTime(a.checkInAt, data.timezone)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Check-out</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular">{fmtTime(a.checkOutAt, data.timezone)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Total</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular">{minutesToHuman(a.workedMinutes)}</dd>
              </div>
            </dl>
          )}

          {a?.verificationStatus === "PENDING" && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-warning-soft px-2.5 py-1 text-xs text-warning">
              <TriangleAlert className="size-3.5" /> Awaiting administrator verification
            </p>
          )}
          {a?.verificationStatus === "REJECTED" && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-danger-soft px-2.5 py-1 text-xs text-danger">
              <TriangleAlert className="size-3.5" /> Rejected{a.adminNote ? `: ${a.adminNote}` : ""}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-4 md:w-[260px]">
          {state === "NOT_CHECKED_IN" && (
            <>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setFlow("check-in")}
                className="group relative grid size-40 place-items-center rounded-full bg-foreground text-background shadow-xl outline-none focus-visible:ring-4 focus-visible:ring-ring"
              >
                <span className="absolute inset-0 animate-[ping_2.4s_cubic-bezier(0,0,0.2,1)_infinite] rounded-full bg-foreground/15 motion-reduce:hidden" />
                <span className="relative flex flex-col items-center gap-1.5">
                  <LogIn className="size-7" />
                  <span className="text-base font-semibold">Check in</span>
                </span>
              </motion.button>
              <p className="flex items-center gap-1.5 text-center text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" /> Location + selfie required
              </p>
            </>
          )}

          {state === "CHECKED_IN" && a && (
            <>
              <div className="relative grid place-items-center">
                <ProgressRing value={netMs / scheduledMs} />
                <div className="absolute flex flex-col items-center">
                  <span className="text-[11px] font-medium text-muted-foreground">Active</span>
                  <span className="text-2xl font-semibold tabular">{durationClock(elapsedMs)}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {Math.min(100, Math.round((netMs / scheduledMs) * 100))}% of shift
                  </span>
                </div>
              </div>
              <Button size="lg" variant="outline" className="w-full max-w-[220px]" onClick={() => setFlow("check-out")}>
                <LogOut /> Check out
              </Button>
            </>
          )}

          {state === "COMPLETED" && (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="grid size-16 place-items-center rounded-full bg-success-soft">
                <CalendarCheck className="size-7 text-success" />
              </div>
              <div className="text-sm font-semibold">Day complete</div>
              <div className="text-xs text-muted-foreground">See you next shift.</div>
            </div>
          )}

          {state === "ON_LEAVE" && (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="grid size-16 place-items-center rounded-full bg-brand-soft">
                {data.leave ? <Plane className="size-7 text-brand" /> : <Coffee className="size-7 text-brand" />}
              </div>
              <div className="text-sm font-semibold">On {data.leave?.type ?? "leave"}</div>
              <div className="text-xs text-muted-foreground">Enjoy your time off.</div>
            </div>
          )}
        </div>
      </div>

      {flow && <AttendanceFlow open={!!flow} onOpenChange={(o) => !o && setFlow(null)} mode={flow} today={data} />}
    </div>
  );
}
