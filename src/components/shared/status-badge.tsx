import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

const toneClass: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  brand: "bg-brand-soft text-brand",
  neutral: "bg-muted text-muted-foreground",
};

const MAP: Record<string, [string, Tone]> = {
  // attendance
  PRESENT: ["Present", "success"],
  LATE: ["Late", "warning"],
  HALF_DAY: ["Half day", "info"],
  ABSENT: ["Absent", "danger"],
  ON_LEAVE: ["On leave", "brand"],
  PENDING_VERIFICATION: ["Pending review", "warning"],
  REJECTED: ["Rejected", "danger"],
  WEEKEND: ["Off", "neutral"],
  UPCOMING: ["Upcoming", "neutral"],
  NOT_JOINED: ["—", "neutral"],
  // verification
  AUTO_APPROVED: ["Auto-verified", "success"],
  APPROVED: ["Approved", "success"],
  PENDING: ["Pending", "warning"],
  // leave
  CANCELLED: ["Cancelled", "neutral"],
  // employment
  ACTIVE: ["Active", "success"],
  PROBATION: ["Probation", "info"],
  NOTICE: ["Notice period", "warning"],
  INACTIVE: ["Inactive", "neutral"],
  TERMINATED: ["Terminated", "danger"],
  // roles
  ADMIN: ["Admin", "brand"],
  EMPLOYEE: ["Employee", "neutral"],
};

export function StatusBadge({ status, className, label }: { status: string; className?: string; label?: string }) {
  const [text, tone] = MAP[status] ?? [status, "neutral" as Tone];
  return (
    <span
      className={cn(
        "inline-flex h-5.5 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-80" />
      {label ?? text}
    </span>
  );
}

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-medium", toneClass[tone], className)}>
      {children}
    </span>
  );
}

export const statusColorVar: Record<string, string> = {
  PRESENT: "var(--success)",
  LATE: "var(--warning)",
  HALF_DAY: "var(--info)",
  ABSENT: "var(--danger)",
  ON_LEAVE: "var(--brand)",
  PENDING_VERIFICATION: "var(--warning)",
  REJECTED: "var(--danger)",
};
