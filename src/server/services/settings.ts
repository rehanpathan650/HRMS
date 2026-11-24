import "server-only";
import { db } from "../lib/db";

export async function getSettings() {
  return db.systemSetting.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
}

export async function getDefaultSchedule() {
  return (
    (await db.workSchedule.findFirst({ where: { isDefault: true } })) ??
    (await db.workSchedule.findFirst({ orderBy: { createdAt: "asc" } }))
  );
}

export async function getDefaultOffice() {
  return (
    (await db.officeLocation.findFirst({ where: { isDefault: true } })) ??
    (await db.officeLocation.findFirst({ orderBy: { createdAt: "asc" } }))
  );
}

export type ScheduleSnapshot = {
  id: string | null;
  name: string;
  startMinute: number;
  endMinute: number;
  graceMinutes: number;
  breakMinutes: number;
  halfDayMinutes: number;
  workDays: number[];
};

export const FALLBACK_SCHEDULE: ScheduleSnapshot = {
  id: null,
  name: "Standard (fallback)",
  startMinute: 9 * 60,
  endMinute: 18 * 60,
  graceMinutes: 10,
  breakMinutes: 60,
  halfDayMinutes: 240,
  workDays: [1, 2, 3, 4, 5],
};

export function snapshotOf(s: {
  id: string;
  name: string;
  startMinute: number;
  endMinute: number;
  graceMinutes: number;
  breakMinutes: number;
  halfDayMinutes: number;
  workDays: number[];
} | null): ScheduleSnapshot {
  if (!s) return FALLBACK_SCHEDULE;
  return {
    id: s.id,
    name: s.name,
    startMinute: s.startMinute,
    endMinute: s.endMinute,
    graceMinutes: s.graceMinutes,
    breakMinutes: s.breakMinutes,
    halfDayMinutes: s.halfDayMinutes,
    workDays: s.workDays,
  };
}

/** Scheduled working minutes of a shift, excluding break. */
export function scheduledMinutes(s: ScheduleSnapshot) {
  const span = s.endMinute > s.startMinute ? s.endMinute - s.startMinute : 1440 - s.startMinute + s.endMinute;
  return Math.max(0, span - s.breakMinutes);
}
