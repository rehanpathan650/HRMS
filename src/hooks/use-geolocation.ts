"use client";

import { useCallback, useState } from "react";

export interface GeoReading {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

type GeoState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "success"; reading: GeoReading }
  | { status: "error"; code: "DENIED" | "UNAVAILABLE" | "TIMEOUT" | "UNSUPPORTED" | "INSECURE"; message: string };

const MESSAGES = {
  DENIED: "Location permission was denied. Enable location access for this site in your browser settings, then try again.",
  UNAVAILABLE: "Your location could not be determined. Move to an open area or enable precise location, then retry.",
  TIMEOUT: "Locating took too long. Please try again.",
  UNSUPPORTED: "This browser does not support location services.",
  INSECURE: "Location requires a secure (HTTPS) connection.",
};

/**
 * Requests a single high-accuracy GPS fix. Only called on explicit user action,
 * so the permission prompt never appears unexpectedly.
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "idle" });

  const locate = useCallback(() => {
    return new Promise<GeoReading | null>((resolve) => {
      if (typeof window === "undefined" || !("geolocation" in navigator)) {
        setState({ status: "error", code: "UNSUPPORTED", message: MESSAGES.UNSUPPORTED });
        return resolve(null);
      }
      if (!window.isSecureContext) {
        setState({ status: "error", code: "INSECURE", message: MESSAGES.INSECURE });
        return resolve(null);
      }
      setState({ status: "locating" });
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const reading = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          };
          setState({ status: "success", reading });
          resolve(reading);
        },
        (err) => {
          const code = err.code === 1 ? "DENIED" : err.code === 3 ? "TIMEOUT" : "UNAVAILABLE";
          setState({ status: "error", code, message: MESSAGES[code] });
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
      );
    });
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { state, locate, reset };
}
