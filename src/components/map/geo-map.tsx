"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface GeoMarker {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  label?: string;
  permanentLabel?: boolean;
  tone?: "brand" | "success" | "warning" | "danger" | "neutral";
}

export interface GeoMapProps {
  markers?: GeoMarker[];
  geofence?: { latitude: number; longitude: number; radiusMeters: number; label?: string } | null;
  height?: number;
  interactive?: boolean;
  onPick?: (lat: number, lng: number) => void;
  className?: string;
}

const Inner = dynamic(() => import("./geo-map-inner"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

/** Interactive Leaflet map (client-only). */
export function GeoMap({ className, height = 260, ...props }: GeoMapProps) {
  return (
    <div className={cn("relative isolate overflow-hidden rounded-lg border", className)} style={{ height }}>
      <Inner height={height} {...props} />
    </div>
  );
}
