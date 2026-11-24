import type { WorkSchedule } from "@prisma/client";
import type { z } from "zod";
import type { workScheduleSchema } from "@/lib/validators/org";

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function scheduleData(body: Partial<z.infer<typeof workScheduleSchema>>) {
  const { startTime, endTime, ...rest } = body;
  return {
    ...rest,
    ...(startTime ? { startMinute: toMinutes(startTime) } : {}),
    ...(endTime ? { endMinute: toMinutes(endTime) } : {}),
    ...(rest.workDays ? { workDays: Array.from(new Set(rest.workDays)).sort() } : {}),
  } as {
    name: string;
    startMinute: number;
    endMinute: number;
    graceMinutes: number;
    breakMinutes: number;
    halfDayMinutes: number;
    workDays: number[];
    isDefault: boolean;
  };
}

export function serializeSchedule(s: WorkSchedule) {
  return {
    id: s.id,
    name: s.name,
    startTime: toHhmm(s.startMinute),
    endTime: toHhmm(s.endMinute),
    graceMinutes: s.graceMinutes,
    breakMinutes: s.breakMinutes,
    halfDayMinutes: s.halfDayMinutes,
    workDays: s.workDays,
    isDefault: s.isDefault,
    overnight: s.endMinute <= s.startMinute,
  };
}
