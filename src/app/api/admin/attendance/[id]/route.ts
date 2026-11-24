import { route } from "@/server/lib/api";
import { db } from "@/server/lib/db";
import { notFound } from "@/server/lib/errors";
import { storage } from "@/server/lib/storage";
import { serializeAttendance } from "@/server/services/attendance";
import { signedAvatar } from "@/server/services/employees";
import { audit } from "@/server/lib/audit";

/** Full verification detail: evidence, signed selfie URLs, geofence, review trail. */
export const GET = route({ auth: "ADMIN" }, async ({ user, params }) => {
  const a = await db.attendance.findUnique({
    where: { id: params.id },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          designation: true,
          avatarKey: true,
          department: { select: { name: true } },
        },
      },
      officeLocation: true,
      reviewedBy: { select: { email: true } },
      evidence: { include: { selfieUpload: true }, orderBy: { recordedAt: "asc" } },
    },
  });
  if (!a) throw notFound("Attendance record not found");

  // Viewing biometric-adjacent evidence is itself an auditable event.
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "attendance.evidence_view",
    entityType: "Attendance",
    entityId: a.id,
  });

  return {
    ...serializeAttendance(a),
    scheduleSnapshot: a.scheduleSnapshot,
    reviewedBy: a.reviewedBy?.email ?? null,
    reviewedAt: a.reviewedAt?.toISOString() ?? null,
    employee: {
      id: a.employee.id,
      name: `${a.employee.firstName} ${a.employee.lastName}`,
      employeeCode: a.employee.employeeCode,
      designation: a.employee.designation,
      department: a.employee.department?.name ?? null,
      avatarUrl: await signedAvatar(a.employee.avatarKey),
    },
    office: a.officeLocation
      ? {
          name: a.officeLocation.name,
          latitude: a.officeLocation.latitude,
          longitude: a.officeLocation.longitude,
          radiusMeters: a.officeLocation.radiusMeters,
        }
      : null,
    evidence: await Promise.all(
      a.evidence.map(async (e) => ({
        id: e.id,
        type: e.type,
        latitude: e.latitude,
        longitude: e.longitude,
        accuracyMeters: e.accuracyMeters,
        distanceMeters: e.distanceMeters,
        withinGeofence: e.withinGeofence,
        recordedAt: e.recordedAt.toISOString(),
        clientTimestamp: e.clientTimestamp?.toISOString() ?? null,
        ipAddress: e.ipAddress,
        userAgent: e.userAgent,
        selfie: e.selfieUpload
          ? {
              url: e.selfieUpload.purgedAt ? null : await storage().signedUrl(e.selfieUpload.storageKey, 300),
              purged: !!e.selfieUpload.purgedAt,
              sizeBytes: e.selfieUpload.sizeBytes,
              sha256: e.selfieUpload.sha256,
            }
          : null,
      })),
    ),
  };
});
