import { z } from "zod";
import { hexColor, optionalText, trimmed } from "./common";

export const departmentSchema = z.object({
  name: trimmed(2, 80, "Name"),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,12}$/, "Use 2-12 letters, numbers, dashes or underscores"),
  description: optionalText(300),
  color: hexColor.default("#6366f1"),
  headId: z
    .string()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const workScheduleSchema = z.object({
  name: trimmed(2, 60, "Name"),
  startTime: hhmm,
  endTime: hhmm,
  graceMinutes: z.number().int().min(0).max(240),
  breakMinutes: z.number().int().min(0).max(240),
  halfDayMinutes: z.number().int().min(30).max(720),
  workDays: z.array(z.number().int().min(1).max(7)).min(1, "Pick at least one work day").max(7),
  isDefault: z.boolean().default(false),
});

export const officeLocationSchema = z.object({
  name: trimmed(2, 80, "Name"),
  address: optionalText(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(20, "Minimum radius is 20 m").max(50_000),
  isDefault: z.boolean().default(false),
});

export const systemSettingsSchema = z.object({
  companyName: trimmed(2, 80, "Company name"),
  timezone: z.string().min(2).max(64),
  allowRemoteAttendance: z.boolean(),
  requireCheckoutSelfie: z.boolean(),
  autoApproveInGeofence: z.boolean(),
  maxGpsAccuracyMeters: z.number().int().min(5).max(5000),
  selfieRetentionDays: z.number().int().min(7).max(3650),
  auditRetentionDays: z.number().int().min(90).max(3650),
});

export const announcementSchema = z.object({
  title: trimmed(3, 120, "Title"),
  body: trimmed(3, 1000, "Message"),
});
