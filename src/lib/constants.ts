export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-attendly_session" : "attendly_session";

export const MAX_SELFIE_BYTES = 3 * 1024 * 1024; // 3 MB
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const SELFIE_UPLOAD_TTL_MINUTES = 10;

export const ATTENDANCE_FLAG_LABELS: Record<string, string> = {
  OUTSIDE_GEOFENCE: "Outside office radius",
  LOW_GPS_ACCURACY: "Low GPS accuracy",
  SUSPICIOUS_ACCURACY: "Implausibly precise GPS",
  DUPLICATE_SELFIE: "Reused selfie image",
  IMPOSSIBLE_TRAVEL: "Impossible travel speed",
  NON_WORKING_DAY: "Non-working day",
  NO_OFFICE_CONFIGURED: "No office location configured",
  CHECKOUT_OUTSIDE_GEOFENCE: "Checked out outside office",
  CHECKOUT_LOW_ACCURACY: "Low accuracy at checkout",
};
