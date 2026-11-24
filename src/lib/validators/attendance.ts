import { z } from "zod";
import { id } from "./common";

const position = {
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(100_000),
  /** Client clock: stored for forensics only, never used as attendance time. */
  positionTimestamp: z.number().int().positive().optional(),
};

export const checkInSchema = z.object({ ...position, selfieUploadId: id });
export const checkOutSchema = z.object({ ...position, selfieUploadId: id.optional() });

export const reviewAttendanceSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(1000).optional(),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
