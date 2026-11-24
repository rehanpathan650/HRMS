"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import type { DaySummary } from "@/lib/types";
import { fmtDate, fmtTime, minutesToHuman, shiftYmd } from "@/lib/format";
import { cn } from "@/lib/utils";

const CELL: Record<string, string> = {
  PRESENT: "bg-success-soft text-success",
  LATE: "bg-warning-soft text-warning",
  HALF_DAY: "bg-info-soft text-info",
  ABSENT: "bg-danger-soft text-danger",
  ON_LEAVE: "bg-brand-soft text-brand",
  PENDING_VERIFICATION: "bg-warning-soft text-warning ring-1 ring-inset ring-warning/40",
  REJECTED: "bg-danger-soft text-danger ring-1 ring-inset ring-danger/40",
  WEEKEND: "text-muted-foreground/60",
  UPCOMING: "text-muted-foreground",
  NOT_JOINED: "text-muted-foreground/40",
};

const LEGEND = [
  ["PRESENT", "Present"],
  ["LATE", "Late"],
  ["HALF_DAY", "Half day"],
  ["ABSENT", "Absent"],
  ["ON_LEAVE", "Leave"],
  ["PENDING_VERIFICATION", "Pending"],
] as const;

export function AttendanceCalendar({
  month,
  days,
  loading,
  onMonthChange,
  timezone,
  today,
}: {
  /** Any YYYY-MM-DD within the displayed month */
  month: string;
  days: DaySummary[] | undefined;
  loading?: boolean;
  onMonthChange?: (ymd: string) => void;
  timezone?: string;
  today?: string;
}) {
  const [y, m] = month.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday-first
  const map = new Map(days?.map((d) => [d.date, d]));
  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T00:00:00Z`));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        {onMonthChange && (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => onMonthChange(shiftYmd(first, -1))}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => onMonthChange(shiftYmd(first, daysInMonth))}>
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="pb-1">
            {d}
          </div>
        ))}
        {Array.from({ length: lead }).map((_, i) => (
          <div key={`l${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const date = `${first.slice(0, 8)}${String(i + 1).padStart(2, "0")}`;
          const d = map.get(date);
          if (loading) return <Skeleton key={date} className="aspect-square rounded-md" />;
          const cell = (
            <div
              className={cn(
                "grid aspect-square place-items-center rounded-md text-xs font-medium tabular transition-transform hover:scale-105",
                d ? CELL[d.status] : "text-muted-foreground/50",
                date === today && "outline-2 outline-offset-1 outline-foreground",
              )}
            >
              {i + 1}
            </div>
          );
          if (!d || ["WEEKEND", "UPCOMING", "NOT_JOINED"].includes(d.status)) return <div key={date}>{cell}</div>;
          return (
            <Tooltip key={date}>
              <TooltipTrigger asChild>{cell}</TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <div className="font-medium">{fmtDate(date, { weekday: "short" })}</div>
                  <div className="opacity-80">{d.status.replace(/_/g, " ").toLowerCase()}</div>
                  {d.checkInAt && (
                    <div className="opacity-80">
                      {fmtTime(d.checkInAt, timezone)} – {d.checkOutAt ? fmtTime(d.checkOutAt, timezone) : "…"}
                      {d.workedMinutes != null && ` · ${minutesToHuman(d.workedMinutes)}`}
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5">
        {LEGEND.map(([k, l]) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn("size-2.5 rounded-sm", CELL[k])} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
