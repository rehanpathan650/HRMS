"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Menu } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { adminNav, breadcrumbsFor, employeeNav, type NavGroup } from "./nav-config";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import { api } from "@/lib/api-client";
import { useMe } from "@/hooks/use-me";
import { cn } from "@/lib/utils";

type Area = "admin" | "employee";

function useBadges(area: Area) {
  const { data } = useQuery({
    queryKey: ["admin", "badges"],
    queryFn: async () => {
      const [v, l] = await Promise.all([
        api.get<{ total: number }>("/admin/attendance", { verification: "PENDING", pageSize: 1 }),
        api.get<{ total: number }>("/admin/leaves", { status: "PENDING", pageSize: 1 }),
      ]);
      return { pendingVerification: v.total, pendingLeaves: l.total };
    },
    enabled: area === "admin",
    refetchInterval: 60_000,
  });
  return data;
}

function NavList({ groups, area, onNavigate }: { groups: NavGroup[]; area: Area; onNavigate?: () => void }) {
  const pathname = usePathname();
  const badges = useBadges(area);
  return (
    <nav className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-1.5 px-2.5 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">{g.label}</div>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
              const count = item.badgeKey ? badges?.[item.badgeKey] : undefined;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                      active
                        ? "text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId={`nav-active-${area}`}
                        className="absolute inset-0 rounded-md bg-sidebar-accent"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                    <item.icon className={cn("relative size-4", active ? "text-foreground" : "text-muted-foreground")} />
                    <span className="relative flex-1 truncate">{item.label}</span>
                    {!!count && (
                      <span className="relative rounded-full bg-brand px-1.5 py-px text-[10.5px] font-semibold text-brand-foreground tabular">
                        {count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ area, children }: { area: Area; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const groups = area === "admin" ? adminNav : employeeNav;
  const crumbs = breadcrumbsFor(pathname);
  const { data: me } = useMe();

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-14 items-center px-4">
          <Link href={area === "admin" ? "/admin/dashboard" : "/employee/dashboard"}>
            <Logo subtitle={false} />
          </Link>
          <span className="ml-auto rounded-md border bg-card px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
            {area === "admin" ? "Admin" : "Employee"}
          </span>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-2.5 py-3">
          <NavList groups={groups} area={area} />
        </div>
        <div className="border-t p-2.5">
          <UserMenu area={area} />
        </div>
      </aside>

      {/* Mobile nav */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[272px] bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center border-b px-4">
            <Logo subtitle={false} />
          </div>
          <div className="overflow-y-auto px-2.5 py-3">
            <NavList groups={groups} area={area} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
              {crumbs.map((c, i) => (
                <Fragment key={c.href}>
                  {i > 0 && <BreadcrumbSeparator className={cn(i < crumbs.length - 1 && "hidden sm:block")} />}
                  <BreadcrumbItem className={cn(i < crumbs.length - 1 && "hidden sm:inline-flex")}>
                    {i === crumbs.length - 1 ? (
                      <BreadcrumbPage className="truncate font-medium">{c.label}</BreadcrumbPage>
                    ) : i === 0 ? (
                      <span className="text-muted-foreground">{c.label}</span>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link href={c.href}>{c.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-1.5">
            {me?.company.name && (
              <span className="mr-2 hidden text-[13px] text-muted-foreground md:inline">{me.company.name}</span>
            )}
            <NotificationBell />
            <div className="lg:hidden">
              <UserMenu area={area} compact />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
