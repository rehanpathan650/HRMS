"use client";

import { useEffect } from "react";
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { GeoMapProps } from "./geo-map";

const TONE: Record<string, string> = {
  brand: "#5b5bd6",
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
  neutral: "#52525b",
};

function FitBounds({ points, fence }: { points: [number, number][]; fence?: GeoMapProps["geofence"] }) {
  const map = useMap();
  const key = JSON.stringify([points, fence]);
  useEffect(() => {
    const bounds = L.latLngBounds([]);
    points.forEach((p) => bounds.extend(p));
    if (fence) bounds.extend(L.latLng(fence.latitude, fence.longitude).toBounds(fence.radiusMeters * 2.4));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 17 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

function PickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function GeoMapInner({ markers = [], geofence, height = 260, onPick, interactive = true }: GeoMapProps) {
  const points = markers.map((m) => [m.latitude, m.longitude] as [number, number]);
  const center: [number, number] = points[0] ?? (geofence ? [geofence.latitude, geofence.longitude] : [20.59, 78.96]);
  return (
    <MapContainer
      center={center}
      zoom={16}
      style={{ height, width: "100%" }}
      scrollWheelZoom={interactive}
      dragging={interactive}
      zoomControl={interactive}
      attributionControl
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      {geofence && (
        <>
          <Circle
            center={[geofence.latitude, geofence.longitude]}
            radius={geofence.radiusMeters}
            pathOptions={{ color: "#5b5bd6", weight: 1.5, fillColor: "#5b5bd6", fillOpacity: 0.08, dashArray: "4 4" }}
          />
          <CircleMarker
            center={[geofence.latitude, geofence.longitude]}
            radius={4}
            pathOptions={{ color: "#fff", weight: 2, fillColor: "#18181b", fillOpacity: 1 }}
          >
            {geofence.label && <Tooltip direction="top">{geofence.label}</Tooltip>}
          </CircleMarker>
        </>
      )}
      {markers.map((m, i) => (
        <span key={i}>
          {m.accuracy != null && m.accuracy > 0 && (
            <Circle
              center={[m.latitude, m.longitude]}
              radius={m.accuracy}
              pathOptions={{ stroke: false, fillColor: TONE[m.tone ?? "brand"], fillOpacity: 0.12 }}
            />
          )}
          <CircleMarker
            center={[m.latitude, m.longitude]}
            radius={7}
            pathOptions={{ color: "#fff", weight: 2.5, fillColor: TONE[m.tone ?? "brand"], fillOpacity: 1 }}
          >
            {m.label && (
              <Tooltip direction="top" offset={[0, -6]} permanent={m.permanentLabel}>
                {m.label}
              </Tooltip>
            )}
          </CircleMarker>
        </span>
      ))}
      <FitBounds points={points} fence={geofence} />
      {onPick && <PickHandler onPick={onPick} />}
    </MapContainer>
  );
}
