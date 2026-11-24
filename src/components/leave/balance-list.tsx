import type { LeaveBalance } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

export function BalanceList({ balances, loading }: { balances?: LeaveBalance[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }
  return (
    <ul className="grid gap-4">
      {balances?.map((b) => {
        const pctUsed = b.allocated ? Math.min(100, (b.used / b.allocated) * 100) : 0;
        const pctPending = b.allocated ? Math.min(100 - pctUsed, (b.pending / b.allocated) * 100) : 0;
        return (
          <li key={b.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-[13px] font-medium">
                <span className="size-2 rounded-full" style={{ background: b.leaveType.color }} />
                {b.leaveType.name}
              </span>
              <span className="text-[13px] tabular">
                {b.leaveType.isPaid ? (
                  <>
                    <span className="font-semibold">{b.available}</span>
                    <span className="text-muted-foreground"> / {b.allocated} days</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Unpaid · {b.used} used</span>
                )}
              </span>
            </div>
            {b.leaveType.isPaid && (
              <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full" style={{ width: `${pctUsed}%`, background: b.leaveType.color }} />
                <div className="h-full opacity-40" style={{ width: `${pctPending}%`, background: b.leaveType.color }} />
              </div>
            )}
            {b.pending > 0 && <div className="mt-1 text-[11px] text-muted-foreground">{b.pending} day(s) pending approval</div>}
          </li>
        );
      })}
    </ul>
  );
}
