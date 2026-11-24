"use client";

import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function CountUp({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Skip animation for reduced motion, off-screen, or background tabs (rAF is paused there).
    if (reduce || !inView || document.hidden) {
      el.textContent = value.toFixed(decimals) + suffix;
      return;
    }
    const controls = animate(0, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => (el.textContent = v.toFixed(decimals) + suffix),
    });
    // If the tab is backgrounded mid-animation, jump to the final value.
    const onVis = () => {
      if (document.hidden) {
        controls.stop();
        el.textContent = value.toFixed(decimals) + suffix;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      controls.stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [value, decimals, suffix, inView, reduce]);
  return <span ref={ref}>{value.toFixed(decimals) + suffix}</span>;
}

const tones = {
  default: "text-muted-foreground bg-muted",
  brand: "text-brand bg-brand-soft",
  success: "text-success bg-success-soft",
  warning: "text-warning bg-warning-soft",
  danger: "text-danger bg-danger-soft",
  info: "text-info bg-info-soft",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
  decimals,
  suffix,
  loading,
  display,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  hint?: React.ReactNode;
  tone?: keyof typeof tones;
  decimals?: number;
  suffix?: string;
  loading?: boolean;
  /** Pre-formatted value to show instead of the animated number. */
  display?: string;
}) {
  return (
    <div className="group relative rounded-xl bg-card p-4 card-elevated transition-shadow hover:shadow-md" data-reveal>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        <span className={cn("grid size-7 place-items-center rounded-md", tones[tone])}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <div className="mt-3 text-[26px] leading-none font-semibold tracking-tight tabular">
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : display !== undefined ? (
          display
        ) : (
          <CountUp value={value} decimals={decimals} suffix={suffix} />
        )}
      </div>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{loading ? <Skeleton className="h-3 w-24" /> : hint}</div>}
    </div>
  );
}
