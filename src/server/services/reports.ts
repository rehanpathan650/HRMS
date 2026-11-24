import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { dateOnly, toYmd } from "../lib/time";
import { buildDayStatuses, employeesWithSchedules } from "./attendance";
import { getSettings, scheduledMinutes } from "./settings";

export const REPORT_TYPES = [
  "attendance",
  "employee",
  "department",
  "late",
  "hours",
  "leave",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_LABELS: Record<ReportType, string> = {
  attendance: "Attendance register",
  employee: "Employee-wise summary",
  department: "Department-wise summary",
  late: "Late arrivals",
  hours: "Working hours",
  leave: "Leave report",
};

export interface ReportColumn {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "datetime" | "hours" | "percent";
}

export interface Report {
  type: ReportType;
  title: string;
  from: string;
  to: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
}

const hrs = (m: number | null | undefined) => (m == null ? null : Math.round((m / 60) * 100) / 100);

function fmtTime(d: Date | null | undefined, tz: string) {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

export async function buildReport(
  type: ReportType,
  from: string,
  to: string,
  filters: { departmentId?: string; employeeId?: string },
): Promise<Report> {
  const settings = await getSettings();
  const tz = settings.timezone;
  const empWhere: Prisma.EmployeeWhereInput = {
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.employeeId ? { id: filters.employeeId } : {}),
  };
  const base = { type, title: REPORT_LABELS[type], from, to };

  if (type === "attendance" || type === "late") {
    const records = await db.attendance.findMany({
      where: {
        workDate: { gte: dateOnly(from), lte: dateOnly(to) },
        employee: empWhere,
        ...(type === "late" ? { isLate: true, status: { not: "REJECTED" as const } } : {}),
      },
      include: { employee: { include: { department: true } } },
      orderBy: [{ workDate: "desc" }, { checkInAt: "asc" }],
      take: 20_000,
    });
    if (type === "late") {
      return {
        ...base,
        columns: [
          { key: "date", label: "Date", type: "date" },
          { key: "code", label: "Employee ID" },
          { key: "name", label: "Employee" },
          { key: "department", label: "Department" },
          { key: "checkIn", label: "Check-in" },
          { key: "lateMinutes", label: "Minutes late", type: "number" },
          { key: "status", label: "Status" },
        ],
        rows: records.map((r) => ({
          date: toYmd(r.workDate),
          code: r.employee.employeeCode,
          name: `${r.employee.firstName} ${r.employee.lastName}`,
          department: r.employee.department?.name ?? "—",
          checkIn: fmtTime(r.checkInAt, tz),
          lateMinutes: r.lateMinutes,
          status: r.status,
        })),
      };
    }
    return {
      ...base,
      columns: [
        { key: "date", label: "Date", type: "date" },
        { key: "code", label: "Employee ID" },
        { key: "name", label: "Employee" },
        { key: "department", label: "Department" },
        { key: "checkIn", label: "Check-in" },
        { key: "checkOut", label: "Check-out" },
        { key: "hours", label: "Hours", type: "hours" },
        { key: "status", label: "Status" },
        { key: "verification", label: "Verification" },
        { key: "lateMinutes", label: "Late (min)", type: "number" },
        { key: "earlyMinutes", label: "Early leave (min)", type: "number" },
        { key: "remote", label: "Remote" },
        { key: "flags", label: "Flags" },
      ],
      rows: records.map((r) => ({
        date: toYmd(r.workDate),
        code: r.employee.employeeCode,
        name: `${r.employee.firstName} ${r.employee.lastName}`,
        department: r.employee.department?.name ?? "—",
        checkIn: fmtTime(r.checkInAt, tz),
        checkOut: fmtTime(r.checkOutAt, tz),
        hours: hrs(r.workedMinutes),
        status: r.status,
        verification: r.verificationStatus,
        lateMinutes: r.lateMinutes,
        earlyMinutes: r.earlyMinutes,
        remote: r.isRemote ? "Yes" : "No",
        flags: r.flags.join(", "),
      })),
    };
  }

  if (type === "leave") {
    const leaves = await db.leaveRequest.findMany({
      where: { startDate: { lte: dateOnly(to) }, endDate: { gte: dateOnly(from) }, employee: empWhere },
      include: { employee: { include: { department: true } }, leaveType: true, reviewer: { select: { email: true } } },
      orderBy: { startDate: "desc" },
    });
    return {
      ...base,
      columns: [
        { key: "code", label: "Employee ID" },
        { key: "name", label: "Employee" },
        { key: "department", label: "Department" },
        { key: "type", label: "Leave type" },
        { key: "start", label: "From", type: "date" },
        { key: "end", label: "To", type: "date" },
        { key: "days", label: "Days", type: "number" },
        { key: "status", label: "Status" },
        { key: "reviewer", label: "Reviewed by" },
        { key: "reason", label: "Reason" },
      ],
      rows: leaves.map((l) => ({
        code: l.employee.employeeCode,
        name: `${l.employee.firstName} ${l.employee.lastName}`,
        department: l.employee.department?.name ?? "—",
        type: l.leaveType.name,
        start: toYmd(l.startDate),
        end: toYmd(l.endDate),
        days: l.days,
        status: l.status,
        reviewer: l.reviewer?.email ?? "—",
        reason: l.reason,
      })),
    };
  }

  // Aggregated reports need the day-status grid.
  const employees = await employeesWithSchedules(empWhere);
  const grid = await buildDayStatuses(employees, from, to, tz);
  const perEmployee = employees.map((e) => {
    const days = grid.get(e.id)!;
    let present = 0, late = 0, absent = 0, halfDay = 0, onLeave = 0, rejected = 0, worked = 0, workedDays = 0, overtime = 0, early = 0;
    const sched = scheduledMinutes(e.schedule);
    for (const s of days.values()) {
      if (s.status === "ABSENT") absent++;
      else if (s.status === "ON_LEAVE") onLeave++;
      const r = s.record;
      if (!r) continue;
      if (r.status === "REJECTED") {
        rejected++;
        continue;
      }
      present++;
      if (r.isLate) late++;
      if (r.status === "HALF_DAY") halfDay++;
      if (r.isEarlyDeparture) early++;
      if (r.workedMinutes != null) {
        worked += r.workedMinutes;
        workedDays++;
        overtime += Math.max(0, r.workedMinutes - sched);
      }
    }
    return { e, present, late, absent, halfDay, onLeave, rejected, worked, workedDays, overtime, early, sched };
  });

  if (type === "employee") {
    return {
      ...base,
      columns: [
        { key: "code", label: "Employee ID" },
        { key: "name", label: "Employee" },
        { key: "department", label: "Department" },
        { key: "present", label: "Present", type: "number" },
        { key: "late", label: "Late", type: "number" },
        { key: "halfDay", label: "Half days", type: "number" },
        { key: "absent", label: "Absent", type: "number" },
        { key: "onLeave", label: "On leave", type: "number" },
        { key: "rejected", label: "Rejected", type: "number" },
        { key: "rate", label: "Attendance %", type: "percent" },
        { key: "hours", label: "Total hours", type: "hours" },
      ],
      rows: perEmployee.map((p) => ({
        code: p.e.employeeCode,
        name: `${p.e.firstName} ${p.e.lastName}`,
        department: p.e.department?.name ?? "—",
        present: p.present,
        late: p.late,
        halfDay: p.halfDay,
        absent: p.absent,
        onLeave: p.onLeave,
        rejected: p.rejected,
        rate: p.present + p.absent ? Math.round((p.present / (p.present + p.absent)) * 1000) / 10 : null,
        hours: hrs(p.worked),
      })),
    };
  }

  if (type === "hours") {
    return {
      ...base,
      columns: [
        { key: "code", label: "Employee ID" },
        { key: "name", label: "Employee" },
        { key: "department", label: "Department" },
        { key: "days", label: "Days worked", type: "number" },
        { key: "total", label: "Total hours", type: "hours" },
        { key: "avg", label: "Avg hours / day", type: "hours" },
        { key: "scheduled", label: "Scheduled / day", type: "hours" },
        { key: "overtime", label: "Overtime hours", type: "hours" },
        { key: "early", label: "Early departures", type: "number" },
      ],
      rows: perEmployee.map((p) => ({
        code: p.e.employeeCode,
        name: `${p.e.firstName} ${p.e.lastName}`,
        department: p.e.department?.name ?? "—",
        days: p.workedDays,
        total: hrs(p.worked),
        avg: p.workedDays ? hrs(p.worked / p.workedDays) : null,
        scheduled: hrs(p.sched),
        overtime: hrs(p.overtime),
        early: p.early,
      })),
    };
  }

  // department
  const depts = new Map<string, { name: string; headcount: number; present: number; late: number; absent: number; onLeave: number; worked: number; workedDays: number }>();
  for (const p of perEmployee) {
    const k = p.e.department?.name ?? "Unassigned";
    const d = depts.get(k) ?? { name: k, headcount: 0, present: 0, late: 0, absent: 0, onLeave: 0, worked: 0, workedDays: 0 };
    d.headcount++;
    d.present += p.present;
    d.late += p.late;
    d.absent += p.absent;
    d.onLeave += p.onLeave;
    d.worked += p.worked;
    d.workedDays += p.workedDays;
    depts.set(k, d);
  }
  return {
    ...base,
    columns: [
      { key: "name", label: "Department" },
      { key: "headcount", label: "Headcount", type: "number" },
      { key: "present", label: "Present days", type: "number" },
      { key: "late", label: "Late arrivals", type: "number" },
      { key: "absent", label: "Absent days", type: "number" },
      { key: "onLeave", label: "Leave days", type: "number" },
      { key: "rate", label: "Attendance %", type: "percent" },
      { key: "avg", label: "Avg hours / day", type: "hours" },
    ],
    rows: Array.from(depts.values()).map((d) => ({
      name: d.name,
      headcount: d.headcount,
      present: d.present,
      late: d.late,
      absent: d.absent,
      onLeave: d.onLeave,
      rate: d.present + d.absent ? Math.round((d.present / (d.present + d.absent)) * 1000) / 10 : null,
      avg: d.workedDays ? hrs(d.worked / d.workedDays) : null,
    })),
  };
}

/** CSV with formula-injection protection (cells starting with = + - @ are prefixed). */
export function toCsv(report: Report) {
  const esc = (v: unknown) => {
    if (v == null) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [report.columns.map((c) => esc(c.label)).join(",")];
  for (const r of report.rows) lines.push(report.columns.map((c) => esc(r[c.key])).join(","));
  return "﻿" + lines.join("\r\n");
}

export async function toXlsx(report: Report) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Attendly";
  wb.created = new Date();
  const ws = wb.addWorksheet(report.title.slice(0, 31));
  ws.addRow([`${report.title}`]).font = { bold: true, size: 14 };
  ws.addRow([`Period: ${report.from} to ${report.to}`]).font = { color: { argb: "FF6B7280" } };
  ws.addRow([]);
  const header = ws.addRow(report.columns.map((c) => c.label));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } };
  });
  for (const r of report.rows) {
    ws.addRow(
      report.columns.map((c) => {
        const v = r[c.key];
        if (typeof v === "string" && /^[=+\-@]/.test(v)) return `'${v}`;
        return v ?? "";
      }),
    );
  }
  ws.columns.forEach((col, i) => {
    const c = report.columns[i];
    col.width = Math.min(40, Math.max(12, (c?.label.length ?? 10) + 4));
  });
  ws.views = [{ state: "frozen", ySplit: 4 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
