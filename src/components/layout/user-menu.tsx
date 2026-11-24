"use client";

import Link from "next/link";

import { useTheme } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronsUpDown, LayoutDashboard, LogOut, Monitor, Moon, Settings, Sun, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export function UserMenu({ area, compact }: { area: "admin" | "employee"; compact?: boolean }) {
  const { data: me } = useMe();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();
  const name = me?.employee?.name ?? me?.email ?? "…";

  const logout = async () => {
    await api.post("/auth/logout").catch(() => {});
    qc.clear();
    window.location.assign("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
          compact && "w-auto",
        )}
      >
        <UserAvatar name={name} src={me?.employee?.avatarUrl} className="size-7" />
        {!compact && (
          <>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-medium">{name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{me?.email}</div>
            </div>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side={compact ? "bottom" : "top"} className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="text-[13px] font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">{me?.employee?.designation ?? me?.role}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {me?.employee && (
          <DropdownMenuItem asChild>
            <Link href="/employee/profile">
              <User /> Profile
            </Link>
          </DropdownMenuItem>
        )}
        {me?.role === "ADMIN" && area === "admin" && me.employee && (
          <DropdownMenuItem asChild>
            <Link href="/employee/dashboard">
              <LayoutDashboard /> My attendance
            </Link>
          </DropdownMenuItem>
        )}
        {me?.role === "ADMIN" && area === "employee" && (
          <DropdownMenuItem asChild>
            <Link href="/admin/dashboard">
              <ArrowLeft /> Back to admin
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href={area === "admin" ? "/admin/settings" : "/employee/settings"}>
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[13px] text-muted-foreground">Theme</span>
          <div className="flex rounded-md border p-0.5">
            {[
              { v: "light", I: Sun },
              { v: "dark", I: Moon },
              { v: "system", I: Monitor },
            ].map(({ v, I }) => (
              <button
                key={v}
                onClick={() => setTheme(v)}
                aria-label={`${v} theme`}
                className={cn(
                  "grid size-6 place-items-center rounded text-muted-foreground transition-colors",
                  theme === v && "bg-muted text-foreground",
                )}
              >
                <I className="size-3.5" />
              </button>
            ))}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} variant="destructive">
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
