import {
  Building2,
  CalendarDays,
  CalendarPlus,
  ChartColumn,
  Clock3,
  History,
  LayoutDashboard,
  ScanFace,
  ScrollText,
  Settings,
  ShieldCheck,
  User,
  Users,
  FileSpreadsheet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badgeKey?: "pendingVerification" | "pendingLeaves";
  exact?: boolean;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const adminNav: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Attendance",
    items: [
      { label: "Live & records", href: "/admin/attendance", icon: Clock3, exact: true },
      { label: "Verification", href: "/admin/attendance/verification", icon: ShieldCheck, badgeKey: "pendingVerification" },
      { label: "Attendance reports", href: "/admin/attendance/reports", icon: FileSpreadsheet },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Employees", href: "/admin/employees", icon: Users },
      { label: "Departments", href: "/admin/departments", icon: Building2 },
      { label: "Leave", href: "/admin/leaves", icon: CalendarDays, badgeKey: "pendingLeaves" },
    ],
  },
  {
    label: "Insights & system",
    items: [
      { label: "Reports", href: "/admin/reports", icon: ChartColumn },
      { label: "Audit logs", href: "/admin/audit-logs", icon: ScrollText },
      { label: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

export const employeeNav: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", href: "/employee/dashboard", icon: LayoutDashboard },
      { label: "Attendance", href: "/employee/attendance", icon: ScanFace, exact: true },
      { label: "History", href: "/employee/attendance/history", icon: History },
    ],
  },
  {
    label: "Time off",
    items: [
      { label: "My leave", href: "/employee/leaves", icon: CalendarDays, exact: true },
      { label: "Apply for leave", href: "/employee/leaves/apply", icon: CalendarPlus },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Profile", href: "/employee/profile", icon: User },
      { label: "Settings", href: "/employee/settings", icon: Settings },
    ],
  },
];

const LABELS: Record<string, string> = {
  admin: "Admin",
  employee: "Employee",
  dashboard: "Dashboard",
  employees: "Employees",
  attendance: "Attendance",
  verification: "Verification",
  reports: "Reports",
  leaves: "Leave",
  departments: "Departments",
  settings: "Settings",
  "audit-logs": "Audit logs",
  history: "History",
  apply: "Apply",
  profile: "Profile",
};

export function breadcrumbsFor(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  return parts.map((p, i) => ({
    label: LABELS[p] ?? (p.length > 16 ? "Details" : p),
    href: "/" + parts.slice(0, i + 1).join("/"),
  }));
}
