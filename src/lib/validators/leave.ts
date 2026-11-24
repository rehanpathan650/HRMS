import { z } from "zod";
import { hexColor, id, optionalText, trimmed, ymd } from "./common";

export const applyLeaveSchema = z
  .object({
    leaveTypeId: id,
    startDate: ymd,
    endDate: ymd,
    halfDay: z.boolean().default(false),
    reason: trimmed(5, 1000, "Reason"),
  })
  .refine((d) => d.endDate >= d.startDate, { message: "End date must be on or after start date", path: ["endDate"] })
  .refine((d) => !d.halfDay || d.startDate === d.endDate, {
    message: "Half-day leave must be a single day",
    path: ["halfDay"],
  });

export const reviewLeaveSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().trim().max(1000).optional(),
});

export const leaveTypeSchema = z.object({
  name: trimmed(2, 60, "Name"),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,12}$/, "Use 2-12 letters, numbers or underscores"),
  description: optionalText(300),
  defaultDays: z.number().min(0).max(365),
  isPaid: z.boolean().default(true),
  color: hexColor.default("#10b981"),
  isActive: z.boolean().default(true),
});

export const leaveBalanceSchema = z.object({
  employeeId: id,
  leaveTypeId: id,
  year: z.number().int().min(2000).max(2100),
  allocated: z.number().min(0).max(365),
});
