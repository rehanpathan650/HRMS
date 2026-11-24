import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 -m-3 rounded-full bg-grid opacity-60 [mask-image:radial-gradient(circle,black,transparent_70%)]" />
        <div className="relative grid size-11 place-items-center rounded-xl border bg-card shadow-xs">
          <Icon className="size-5 text-muted-foreground" />
        </div>
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-sm font-medium text-brand hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}
