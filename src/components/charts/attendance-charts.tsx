"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate } from "@/lib/format";

/* Series order is fixed (never cycled): identity follows the entity. Validated for CVD with legend + tooltip as secondary encoding. */
export const SERIES = [
  { key: "onTime", label: "On time", color: "var(--success)" },
  { key: "onLeave", label: "On leave", color: "var(--brand)" },
  { key: "late", label: "Late", color: "var(--warning)" },
  { key: "absent", label: "Absent", color: "var(--danger)" },
] as const;

export interface TrendPoint {
  date: string;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  rate: number;
}

function Legend({ items }: { items: readonly { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function TipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="min-w-[160px] rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="mb-1.5 font-medium text-foreground">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            {r.color && <span className="size-2 rounded-[2px]" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="font-medium text-foreground tabular">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

const axis = { fontSize: 11, fill: "var(--muted-foreground)" };

export function AttendanceTrendChart({ data, height = 260 }: { data: TrendPoint[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, onTime: Math.max(0, d.present - d.late) }));
  return (
    <div>
      <Legend items={SERIES} />
      <div className="mt-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={axis}
              tickFormatter={(d) => fmtDate(d, { year: undefined, month: "short", day: "numeric" })}
              minTickGap={16}
            />
            <YAxis tickLine={false} axisLine={false} tick={axis} allowDecimals={false} width={44} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TipBox
                    title={fmtDate(String(label), { weekday: "short" })}
                    rows={[
                      ...SERIES.map((s) => ({
                        label: s.label,
                        value: String((payload[0].payload as Record<string, number>)[s.key] ?? 0),
                        color: s.color,
                      })),
                      { label: "Attendance rate", value: `${(payload[0].payload as TrendPoint).rate}%` },
                    ]}
                  />
                ) : null
              }
            />
            {SERIES.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="a"
                fill={s.color}
                stroke="var(--card)"
                strokeWidth={2}
                radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive
                animationDuration={600}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function RateLineChart({ data, height = 160 }: { data: TrendPoint[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" hide />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={axis} width={44} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TipBox title={fmtDate(String(label), { weekday: "short" })} rows={[{ label: "Attendance rate", value: `${payload[0].value}%`, color: "var(--chart-1)" }]} />
              ) : null
            }
          />
          <Line
            type="monotone"
            dataKey="rate"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4.5, stroke: "var(--card)", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface DeptRow {
  id: string;
  name: string;
  color: string;
  present: number;
  expected: number;
  late: number;
}

/** Department attendance today: one bar per department, magnitude = present / expected. */
export function DepartmentBars({ rows }: { rows: DeptRow[] }) {
  return (
    <ul className="grid gap-3.5">
      {rows.map((d) => {
        const pct = d.expected ? Math.round((d.present / d.expected) * 100) : 0;
        return (
          <li key={d.id} className="group">
            <div className="mb-1.5 flex items-center justify-between text-[13px]">
              <span className="inline-flex items-center gap-2 font-medium">
                <span className="size-2 rounded-full" style={{ background: d.color }} />
                {d.name}
              </span>
              <span className="text-muted-foreground tabular">
                <span className="font-medium text-foreground">{d.present}</span>/{d.expected} · {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" title={`${d.present} of ${d.expected} present, ${d.late} late`}>
              <div className="h-full rounded-full bg-chart-1 transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
