"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { monthRange, shiftYmd, todayYmd, weekRange } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface Range {
  from: string;
  to: string;
}

export const presets = (base = todayYmd()) => ({
  today: { from: base, to: base, label: "Today" },
  week: { ...weekRange(base), label: "This week" },
  month: { ...monthRange(base), label: "This month" },
  last30: { from: shiftYmd(base, -29), to: base, label: "Last 30 days" },
  lastMonth: { ...monthRange(shiftYmd(monthRange(base).from, -1)), label: "Last month" },
});

export function DateRangeFilter({
  value,
  onChange,
  presetKeys = ["today", "week", "month", "last30"],
  className,
}: {
  value: Range;
  onChange: (r: Range) => void;
  presetKeys?: (keyof ReturnType<typeof presets>)[];
  className?: string;
}) {
  const p = presets();
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex rounded-md border p-0.5">
        {presetKeys.map((k) => {
          const active = p[k].from === value.from && p[k].to === value.to;
          return (
            <Button
              key={k}
              type="button"
              variant="ghost"
              size="xs"
              className={cn("h-7 px-2.5 text-xs", active && "bg-muted text-foreground")}
              onClick={() => onChange({ from: p[k].from, to: p[k].to })}
            >
              {p[k].label}
            </Button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          aria-label="From date"
          value={value.from}
          max={value.to}
          onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })}
          className="h-8 w-[140px] text-xs"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          aria-label="To date"
          value={value.to}
          min={value.from}
          onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })}
          className="h-8 w-[140px] text-xs"
        />
      </div>
    </div>
  );
}
