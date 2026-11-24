import { z } from "zod";
import { optionalText, trimmed, ymd } from "./common";

const phone = z
  .string()
  .trim()
  .max(20)
  .regex(/^[+0-9 ()-]*$/, "Invalid phone number")
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const nullableId = z
  .string()
  .max(40)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const employeeBase = z.object({
  firstName: trimmed(1, 60, "First name"),
  lastName: trimmed(1, 60, "Last name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  phone,
  employeeCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, "Use 2-20 letters, numbers or dashes"),
  designation: trimmed(1, 80, "Designation"),
  joiningDate: ymd,
  departmentId: nullableId,
  managerId: nullableId,
  workScheduleId: nullableId,
  officeLocationId: nullableId,
  status: z.enum(["ACTIVE", "PROBATION", "NOTICE", "INACTIVE", "TERMINATED"]).default("ACTIVE"),
  role: z.enum(["ADMIN", "EMPLOYEE"]).default("EMPLOYEE"),
  allowRemote: z.boolean().default(false),
});

export const createEmployeeSchema = employeeBase;
export const updateEmployeeSchema = employeeBase.partial();

export const selfProfileSchema = z.object({
  phone,
  address: optionalText(300),
  emergencyContact: optionalText(120),
  dateOfBirth: ymd.optional().nullable(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
