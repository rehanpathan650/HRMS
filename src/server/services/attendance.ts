import "server-only";
import type { Attendance, AttendanceStatus, Prisma } from "@prisma/client";
import { db } from "../lib/db";
import { audit } from "../lib/audit";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { haversineMeters } from "../lib/geo";
import { addDays, dateOnly, isoWeekday, localDateString, localMinuteOfDay, toYmd, zonedTimeToUtc } from "../lib/time";
import type { SessionUser } from "../lib/session";
import { SELFIE_UPLOAD_TTL_MINUTES } from "@/lib/constants";
import { getDefaultOffice, getDefaultSchedule, getSettings, snapshotOf, type ScheduleSnapshot } from "./settings";
import { notify, notifyAdmins } from "./notifications";

interface PositionInput {
  latitude: number;
  longitude: number;
  accuracy: number;
  positionTimestamp?: number;
  selfieUploadId?: string;
}

interface Meta {
  ip: string;
  userAgent: string;
}

/** Flags that send a record to the admin verification queue. */
const REVIEW_FLAGS = new Set([
  "OUTSIDE_GEOFENCE",
  "LOW_GPS_ACCURACY",
  "SUSPICIOUS_ACCURACY",
  "DUPLICATE_SELFIE",
  "IMPOSSIBLE_TRAVEL",
  "NO_OFFICE_CONFIGURED",
  "CHECKOUT_OUTSIDE_GEOFENCE",
]);

const FLAG_WEIGHTS: Record<string, number> = {
  OUTSIDE_GEOFENCE: 30,
  LOW_GPS_ACCURACY: 20,
  SUSPICIOUS_ACCURACY: 25,
  DUPLICATE_SELFIE: 40,
  IMPOSSIBLE_TRAVEL: 50,
  NON_WORKING_DAY: 5,
  NO_OFFICE_CONFIGURED: 10,
  CHECKOUT_OUTSIDE_GEOFENCE: 15,
  CHECKOUT_LOW_ACCURACY: 10,
};

const riskOf = (flags: string[]) => Math.min(100, flags.reduce((s, f) => s + (FLAG_WEIGHTS[f] ?? 10), 0));

const ACTIVE_EMPLOYMENT = ["ACTIVE", "PROBATION", "NOTICE"] as const;

async function loadContext(employeeId: string) {
  const [employee, settings] = await Promise.all([
    db.employee.findUnique({
      where: { id: employeeId },
      include: { workSchedule: true, officeLocation: true, user: { select: { id: true, email: true } } },
    }),
    getSettings(),
  ]);
  if (!employee) throw notFound("Employee profile not found");
  const schedule = snapshotOf(employee.workSchedule ?? (await getDefaultSchedule()));
  const office = employee.officeLocation ?? (await getDefaultOffice());
  return { employee, settings, schedule, office };
}

/** Work date for an instant. Early-morning punches on overnight shifts belong to the previous day. */
function workDateFor(now: Date, tz: string, schedule: ScheduleSnapshot) {
  const today = localDateString(now, tz);
  const overnight = schedule.endMinute <= schedule.startMinute;
  if (overnight && localMinuteOfDay(now, tz) < schedule.endMinute + 120) return addDays(today, -1);
  return today;
}

function shiftBounds(workDate: string, tz: string, s: ScheduleSnapshot) {
  const start = zonedTimeToUtc(workDate, s.startMinute, tz);
  const endDate = s.endMinute <= s.startMinute ? addDays(workDate, 1) : workDate;
  const end = zonedTimeToUtc(endDate, s.endMinute, tz);
  return { start, end };
}

export function finalStatus(a: { isLate: boolean; workedMinutes: number | null }, s: ScheduleSnapshot): AttendanceStatus {
  if (a.workedMinutes != null && a.workedMinutes < s.halfDayMinutes) return "HALF_DAY";
  return a.isLate ? "LATE" : "PRESENT";
}

async function consumeSelfie(
  tx: Prisma.TransactionClient,
  employeeId: string,
  selfieUploadId: string,
  now: Date,
) {
  const upload = await tx.selfieUpload.findUnique({ where: { id: selfieUploadId } });
  if (!upload || upload.employeeId !== employeeId) throw badRequest("Selfie not found. Please capture it again.");
  if (upload.consumedAt) throw conflict("This selfie has already been used. Please capture a new one.");
  if (now.getTime() - upload.createdAt.getTime() > SELFIE_UPLOAD_TTL_MINUTES * 60_000) {
    throw badRequest("Selfie expired. Please capture a new one.");
  }
  // Atomic single-use claim (guards against concurrent replays).
  const claimed = await tx.selfieUpload.updateMany({
    where: { id: selfieUploadId, consumedAt: null },
    data: { consumedAt: now },
  });
  if (claimed.count !== 1) throw conflict("This selfie has already been used.");

  const reused = await tx.selfieUpload.count({
    where: { employeeId, sha256: upload.sha256, id: { not: upload.id }, consumedAt: { not: null } },
  });
  return { upload, reused: reused > 0 };
}

async function impossibleTravel(employeeId: string, lat: number, lng: number, now: Date) {
  const last = await db.attendanceEvidence.findFirst({
    where: { attendance: { employeeId } },
    orderBy: { recordedAt: "desc" },
    select: { latitude: true, longitude: true, recordedAt: true },
  });
  if (!last) return false;
  const hours = (now.getTime() - last.recordedAt.getTime()) / 3_600_000;
  if (hours <= 0 || hours > 12) return false;
  const km = haversineMeters(last.latitude, last.longitude, lat, lng) / 1000;
  return km > 5 && km / hours > 300; // faster than ~300 km/h
}

function evaluatePosition(
  input: PositionInput,
  office: { latitude: number; longitude: number; radiusMeters: number } | null,
  maxAccuracy: number,
) {
  const flags: string[] = [];
  let distance: number | null = null;
  let within = false;
  if (!office) {
    flags.push("NO_OFFICE_CONFIGURED");
  } else {
    distance = Math.round(haversineMeters(input.latitude, input.longitude, office.latitude, office.longitude));
    within = distance <= office.radiusMeters;
  }
  if (input.accuracy > maxAccuracy) flags.push("LOW_GPS_ACCURACY");
  if (input.accuracy < 1) flags.push("SUSPICIOUS_ACCURACY");
  return { flags, distance, within };
}

function clientTs(ts?: number) {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) || Math.abs(d.getTime() - Date.now()) > 7 * 86_400_000 ? null : d;
}

// ─── Check-in ─────────────────────────────────────────────────────────────

export async function checkIn(user: SessionUser, input: PositionInput & { selfieUploadId: string }, meta: Meta) {
  const employeeId = user.employee!.id;
  const { employee, settings, schedule, office } = await loadContext(employeeId);
  if (!ACTIVE_EMPLOYMENT.includes(employee.status as (typeof ACTIVE_EMPLOYMENT)[number])) {
    throw forbidden("Your employment status does not allow attendance.");
  }

  const now = new Date(); // server time is the only trusted clock
  const tz = settings.timezone;
  const workDate = workDateFor(now, tz, schedule);

  const open = await db.attendance.findFirst({ where: { employeeId, checkOutAt: null } });
  if (open) throw conflict("You are already checked in. Check out first.");
  const existing = await db.attendance.findUnique({
    where: { employeeId_workDate: { employeeId, workDate: dateOnly(workDate) } },
  });
  if (existing) throw conflict("Attendance for today is already complete.");

  const onLeave = await db.leaveRequest.findFirst({
    where: {
      employeeId,
      status: "APPROVED",
      halfDay: false,
      startDate: { lte: dateOnly(workDate) },
      endDate: { gte: dateOnly(workDate) },
    },
  });
  if (onLeave) throw conflict("You are on approved leave today.");

  const pos = evaluatePosition(input, office, settings.maxGpsAccuracyMeters);
  const flags = [...pos.flags];
  let isRemote = false;
  if (office && !pos.within) {
    const remoteAllowed = settings.allowRemoteAttendance || employee.allowRemote;
    if (!remoteAllowed) {
      throw new ApiError(
        422,
        "OUTSIDE_GEOFENCE",
        `You are ${pos.distance!.toLocaleString()} m from ${office.name}. Check-in is allowed within ${office.radiusMeters} m.`,
        { distanceMeters: pos.distance, radiusMeters: office.radiusMeters },
      );
    }
    isRemote = true;
    flags.push("OUTSIDE_GEOFENCE");
  }
  if (await impossibleTravel(employeeId, input.latitude, input.longitude, now)) flags.push("IMPOSSIBLE_TRAVEL");
  if (!schedule.workDays.includes(isoWeekday(workDate))) flags.push("NON_WORKING_DAY");

  const { start } = shiftBounds(workDate, tz, schedule);
  const lateMinutes = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60_000));
  const isLate = lateMinutes > schedule.graceMinutes;

  const record = await db.$transaction(async (tx) => {
    const selfie = await consumeSelfie(tx, employeeId, input.selfieUploadId, now);
    if (selfie.reused) flags.push("DUPLICATE_SELFIE");

    const needsReview = flags.some((f) => REVIEW_FLAGS.has(f)) || !settings.autoApproveInGeofence;
    const created = await tx.attendance.create({
      data: {
        employeeId,
        workDate: dateOnly(workDate),
        checkInAt: now,
        status: needsReview ? "PENDING_VERIFICATION" : isLate ? "LATE" : "PRESENT",
        verificationStatus: needsReview ? "PENDING" : "AUTO_APPROVED",
        isLate,
        lateMinutes: isLate ? lateMinutes : 0,
        isRemote,
        flags,
        riskScore: riskOf(flags),
        workScheduleId: schedule.id,
        scheduleSnapshot: schedule,
        officeLocationId: office?.id ?? null,
        evidence: {
          create: {
            type: "CHECK_IN",
            latitude: input.latitude,
            longitude: input.longitude,
            accuracyMeters: input.accuracy,
            distanceMeters: pos.distance,
            withinGeofence: pos.within,
            selfieUploadId: selfie.upload.id,
            recordedAt: now,
            clientTimestamp: clientTs(input.positionTimestamp),
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
          },
        },
      },
    });

    await audit(
      {
        actorId: user.id,
        actorEmail: user.email,
        action: "attendance.check_in",
        entityType: "Attendance",
        entityId: created.id,
        metadata: { workDate, flags, distance: pos.distance, accuracy: input.accuracy, isLate, isRemote },
      },
      tx,
    );
    await notify(
      user.id,
      {
        type: "CHECK_IN",
        title: "Checked in",
        body: needsReview
          ? "Your check-in was recorded and is awaiting verification."
          : `You checked in${isLate ? ` ${lateMinutes} min late` : " on time"}.`,
        link: "/employee/attendance",
      },
      tx,
    );
    if (needsReview) {
      await notifyAdmins(
        {
          type: "SYSTEM",
          title: "Attendance needs review",
          body: `${employee.firstName} ${employee.lastName}'s check-in was flagged (${flags.join(", ") || "manual review"}).`,
          link: "/admin/attendance/verification",
        },
        tx,
      );
    }
    return created;
  });

  return serializeAttendance(record);
}

// ─── Check-out ────────────────────────────────────────────────────────────

export async function checkOut(user: SessionUser, input: PositionInput, meta: Meta) {
  const employeeId = user.employee!.id;
  const { settings, office } = await loadContext(employeeId);
  const now = new Date();

  const open = await db.attendance.findFirst({ where: { employeeId, checkOutAt: null } });
  if (!open) throw conflict("You don't have an active check-in.");
  if (settings.requireCheckoutSelfie && !input.selfieUploadId) {
    throw badRequest("A selfie is required to check out.");
  }

  const snapshot = open.scheduleSnapshot as unknown as ScheduleSnapshot;
  const pos = evaluatePosition(input, office, settings.maxGpsAccuracyMeters);
  const newFlags: string[] = [];
  if (pos.flags.includes("LOW_GPS_ACCURACY")) newFlags.push("CHECKOUT_LOW_ACCURACY");
  if (office && !pos.within && !open.isRemote) newFlags.push("CHECKOUT_OUTSIDE_GEOFENCE");

  const grossMinutes = Math.max(0, Math.floor((now.getTime() - open.checkInAt.getTime()) / 60_000));
  const breakMinutes = grossMinutes >= 300 ? snapshot.breakMinutes : 0;
  const workedMinutes = Math.max(0, grossMinutes - breakMinutes);
  const { end } = shiftBounds(toYmd(open.workDate), settings.timezone, snapshot);
  const earlyMinutes = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 60_000));
  const isEarlyDeparture = earlyMinutes > 0;

  const updated = await db.$transaction(async (tx) => {
    let selfieId: string | null = null;
    if (input.selfieUploadId) {
      const s = await consumeSelfie(tx, employeeId, input.selfieUploadId, now);
      if (s.reused) newFlags.push("DUPLICATE_SELFIE");
      selfieId = s.upload.id;
    }
    const flags = Array.from(new Set([...open.flags, ...newFlags]));
    const escalate = newFlags.some((f) => REVIEW_FLAGS.has(f)) && open.verificationStatus === "AUTO_APPROVED";
    const verificationStatus = escalate ? "PENDING" : open.verificationStatus;
    const status: AttendanceStatus =
      verificationStatus === "PENDING"
        ? "PENDING_VERIFICATION"
        : verificationStatus === "REJECTED"
          ? "REJECTED"
          : finalStatus({ isLate: open.isLate, workedMinutes }, snapshot);

    // Conditional update: only succeeds if still open (prevents duplicate check-outs).
    const res = await tx.attendance.updateMany({
      where: { id: open.id, checkOutAt: null },
      data: {
        checkOutAt: now,
        workedMinutes,
        breakMinutes,
        isEarlyDeparture,
        earlyMinutes,
        flags,
        riskScore: riskOf(flags),
        verificationStatus,
        status,
      },
    });
    if (res.count !== 1) throw conflict("You have already checked out.");

    await tx.attendanceEvidence.create({
      data: {
        attendanceId: open.id,
        type: "CHECK_OUT",
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMeters: input.accuracy,
        distanceMeters: pos.distance,
        withinGeofence: pos.within,
        selfieUploadId: selfieId,
        recordedAt: now,
        clientTimestamp: clientTs(input.positionTimestamp),
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    await audit(
      {
        actorId: user.id,
        actorEmail: user.email,
        action: "attendance.check_out",
        entityType: "Attendance",
        entityId: open.id,
        metadata: { workedMinutes, earlyMinutes, flags: newFlags, distance: pos.distance },
      },
      tx,
    );
    const h = Math.floor(workedMinutes / 60);
    const m = workedMinutes % 60;
    await notify(
      user.id,
      {
        type: "CHECK_OUT",
        title: "Checked out",
        body: `You worked ${h}h ${m}m today.${escalate ? " Your record was sent for verification." : ""}`,
        link: "/employee/attendance/history",
      },
      tx,
    );
    return tx.attendance.findUniqueOrThrow({ where: { id: open.id } });
  });

  return serializeAttendance(updated);
}

// ─── Admin review ─────────────────────────────────────────────────────────

export async function reviewAttendance(
  admin: SessionUser,
  attendanceId: string,
  decision: "APPROVE" | "REJECT",
  note?: string,
) {
  const record = await db.attendance.findUnique({
    where: { id: attendanceId },
    include: { employee: { select: { userId: true, firstName: true, lastName: true } } },
  });
  if (!record) throw notFound("Attendance record not found");
  const snapshot = record.scheduleSnapshot as unknown as ScheduleSnapshot;

  const approve = decision === "APPROVE";
  const status: AttendanceStatus = approve
    ? record.checkOutAt
      ? finalStatus(record, snapshot)
      : record.isLate
        ? "LATE"
        : "PRESENT"
    : "REJECTED";

  return db.$transaction(async (tx) => {
    const updated = await tx.attendance.update({
      where: { id: attendanceId },
      data: {
        verificationStatus: approve ? "APPROVED" : "REJECTED",
        status,
        adminNote: note || null,
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    });
    await audit(
      {
        actorId: admin.id,
        actorEmail: admin.email,
        action: approve ? "attendance.approve" : "attendance.reject",
        entityType: "Attendance",
        entityId: attendanceId,
        metadata: {
          previousStatus: record.status,
          previousVerification: record.verificationStatus,
          note: note ?? null,
          employee: `${record.employee.firstName} ${record.employee.lastName}`,
        },
      },
      tx,
    );
    await notify(
      record.employee.userId,
      approve
        ? {
            type: "ATTENDANCE_VERIFIED",
            title: "Attendance verified",
            body: `Your attendance for ${toYmd(record.workDate)} was approved.`,
            link: "/employee/attendance/history",
          }
        : {
            type: "ATTENDANCE_REJECTED",
            title: "Attendance rejected",
            body: `Your attendance for ${toYmd(record.workDate)} was rejected.${note ? ` Note: ${note}` : ""}`,
            link: "/employee/attendance/history",
          },
      tx,
    );
    return serializeAttendance(updated);
  });
}

// ─── Read models ──────────────────────────────────────────────────────────

export function serializeAttendance(a: Attendance) {
  return {
    id: a.id,
    workDate: toYmd(a.workDate),
    checkInAt: a.checkInAt.toISOString(),
    checkOutAt: a.checkOutAt?.toISOString() ?? null,
    workedMinutes: a.workedMinutes,
    breakMinutes: a.breakMinutes,
    status: a.status,
    verificationStatus: a.verificationStatus,
    isLate: a.isLate,
    lateMinutes: a.lateMinutes,
    isEarlyDeparture: a.isEarlyDeparture,
    earlyMinutes: a.earlyMinutes,
    isRemote: a.isRemote,
    flags: a.flags,
    riskScore: a.riskScore,
    adminNote: a.adminNote,
  };
}

/** Today's attendance state for the employee dashboard card. */
export async function getTodayState(employeeId: string) {
  const { settings, schedule, office, employee } = await loadContext(employeeId);
  const now = new Date();
  const workDate = workDateFor(now, settings.timezone, schedule);
  const [open, today, leave] = await Promise.all([
    db.attendance.findFirst({ where: { employeeId, checkOutAt: null } }),
    db.attendance.findUnique({ where: { employeeId_workDate: { employeeId, workDate: dateOnly(workDate) } } }),
    db.leaveRequest.findFirst({
      where: {
        employeeId,
        status: "APPROVED",
        startDate: { lte: dateOnly(workDate) },
        endDate: { gte: dateOnly(workDate) },
      },
      include: { leaveType: { select: { name: true } } },
    }),
  ]);
  const { start, end } = shiftBounds(workDate, settings.timezone, schedule);
  const record = open ?? today;
  return {
    serverTime: now.toISOString(),
    workDate,
    timezone: settings.timezone,
    schedule: {
      name: schedule.name,
      start: start.toISOString(),
      end: end.toISOString(),
      graceMinutes: schedule.graceMinutes,
      breakMinutes: schedule.breakMinutes,
      isWorkDay: schedule.workDays.includes(isoWeekday(workDate)),
      scheduledMinutes: Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000) - schedule.breakMinutes),
    },
    office: office
      ? {
          name: office.name,
          latitude: office.latitude,
          longitude: office.longitude,
          radiusMeters: office.radiusMeters,
        }
      : null,
    policy: {
      allowRemote: settings.allowRemoteAttendance || employee.allowRemote,
      requireCheckoutSelfie: settings.requireCheckoutSelfie,
      maxGpsAccuracyMeters: settings.maxGpsAccuracyMeters,
    },
    state: open ? "CHECKED_IN" : today ? "COMPLETED" : leave && !leave.halfDay ? "ON_LEAVE" : "NOT_CHECKED_IN",
    leave: leave ? { type: leave.leaveType.name, halfDay: leave.halfDay } : null,
    attendance: record ? serializeAttendance(record) : null,
  };
}

export type DayStatus =
  | AttendanceStatus
  | "WEEKEND"
  | "UPCOMING"
  | "NOT_JOINED";

/**
 * Builds a per-day status grid for many employees at once. Days without an
 * attendance record are ON_LEAVE (approved leave), ABSENT (past working day),
 * WEEKEND (non-working day) or UPCOMING.
 */
export async function buildDayStatuses(
  employees: { id: string; joiningDate: Date; schedule: ScheduleSnapshot }[],
  from: string,
  to: string,
  timezone: string,
) {
  const ids = employees.map((e) => e.id);
  const [records, leaves] = await Promise.all([
    db.attendance.findMany({
      where: { employeeId: { in: ids }, workDate: { gte: dateOnly(from), lte: dateOnly(to) } },
    }),
    db.leaveRequest.findMany({
      where: {
        employeeId: { in: ids },
        status: "APPROVED",
        startDate: { lte: dateOnly(to) },
        endDate: { gte: dateOnly(from) },
      },
      select: { employeeId: true, startDate: true, endDate: true, halfDay: true },
    }),
  ]);
  const today = localDateString(new Date(), timezone);
  const recordMap = new Map(records.map((r) => [`${r.employeeId}:${toYmd(r.workDate)}`, r]));
  const leaveMap = new Map<string, boolean>();
  for (const l of leaves) {
    for (let d = toYmd(l.startDate); d <= toYmd(l.endDate); d = addDays(d, 1)) {
      leaveMap.set(`${l.employeeId}:${d}`, l.halfDay);
    }
  }

  const result = new Map<string, Map<string, { status: DayStatus; record?: Attendance }>>();
  for (const e of employees) {
    const days = new Map<string, { status: DayStatus; record?: Attendance }>();
    const joined = toYmd(e.joiningDate);
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const key = `${e.id}:${d}`;
      const rec = recordMap.get(key);
      if (rec) days.set(d, { status: rec.status, record: rec });
      else if (d < joined) days.set(d, { status: "NOT_JOINED" });
      else if (leaveMap.has(key)) days.set(d, { status: "ON_LEAVE" });
      else if (!e.schedule.workDays.includes(isoWeekday(d))) days.set(d, { status: "WEEKEND" });
      else if (d >= today) days.set(d, { status: "UPCOMING" });
      else days.set(d, { status: "ABSENT" });
    }
    result.set(e.id, days);
  }
  return result;
}

export async function employeesWithSchedules(where: Prisma.EmployeeWhereInput = {}) {
  const def = snapshotOf(await getDefaultSchedule());
  const list = await db.employee.findMany({
    where,
    include: { workSchedule: true, department: { select: { id: true, name: true, color: true } } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  return list.map((e) => ({ ...e, schedule: e.workSchedule ? snapshotOf(e.workSchedule) : def }));
}
