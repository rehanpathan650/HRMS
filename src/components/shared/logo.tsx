import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="8" className="fill-foreground" />
      <path
        d="M9 21.5 14.4 9.8a.7.7 0 0 1 1.27 0L21 21.5"
        className="stroke-background"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="22.5" cy="11" r="2.6" className="fill-brand" />
    </svg>
  );
}

export function Logo({ className, subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-tight">Attendly</div>
        {subtitle && <div className="mt-0.5 text-[11px] text-muted-foreground">Workforce</div>}
      </div>
    </div>
  );
}
