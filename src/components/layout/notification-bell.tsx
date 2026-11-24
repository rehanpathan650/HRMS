"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CalendarCheck, CalendarX, CircleCheck, CircleX, LogIn, LogOut, Megaphone, ShieldCheck, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  CHECK_IN: LogIn,
  CHECK_OUT: LogOut,
  ATTENDANCE_VERIFIED: CircleCheck,
  ATTENDANCE_REJECTED: CircleX,
  LEAVE_SUBMITTED: Inbox,
  LEAVE_APPROVED: CalendarCheck,
  LEAVE_REJECTED: CalendarX,
  ANNOUNCEMENT: Megaphone,
  SYSTEM: ShieldCheck,
};

export function NotificationBell() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ unread: number; items: Notification[] }>("/notifications"),
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
  });
  const markRead = useMutation({
    mutationFn: (body: { ids?: string[]; all?: boolean }) => api.post("/notifications", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const unread = data?.unread ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={`Notifications (${unread} unread)`}>
          <Bell className="size-4" />
          <AnimatePresence>
            {unread > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground tabular"
              >
                {unread > 9 ? "9+" : unread}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button className="text-xs font-medium text-brand hover:underline" onClick={() => markRead.mutate({ all: true })}>
              Mark all read
            </button>
          )}
        </div>
        <ScrollArea className="max-h-[420px]">
          {!data?.items.length ? (
            <EmptyState icon={Bell} title="You're all caught up" description="New activity will show up here." />
          ) : (
            <ul className="divide-y">
              {data.items.map((n) => {
                const Icon = ICONS[n.type] ?? Bell;
                const content = (
                  <div className={cn("flex gap-3 px-4 py-3 transition-colors hover:bg-muted/60", !n.readAt && "bg-brand-soft/40")}>
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border bg-card">
                      <Icon className="size-3.5 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-medium">{n.title}</p>
                        {!n.readAt && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground/80">{relativeTime(n.createdAt)}</p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id} onClick={() => !n.readAt && markRead.mutate({ ids: [n.id] })}>
                    {n.link ? <Link href={n.link}>{content}</Link> : content}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
