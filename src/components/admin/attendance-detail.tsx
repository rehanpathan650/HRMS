"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, ImageOff, LoaderCircle, MapPin, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { GeoMap } from "@/components/map/geo-map";
import { StatusBadge, Pill } from "@/components/shared/status-badge";
import { PersonCell } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api-client";
import { fmtDate, fmtDateTime, meters, minutesToHuman } from "@/lib/format";
import { ATTENDANCE_FLAG_LABELS } from "@/lib/constants";
import type { AttendanceRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Evidence {
  id: string;
  type: "CHECK_IN" | "CHECK_OUT";
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  distanceMeters: number | null;
  withinGeofence: boolean;
  recordedAt: string;
  clientTimestamp: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  selfie: { url: string | null; purged: boolean; sizeBytes: number; sha256: string } | null;
}
interface Detail extends AttendanceRecord {
  reviewedBy: string | null;
  reviewedAt: string | null;
  scheduleSnapshot: { name: string };
  employee: { id: string; name: string; employeeCode: string; designation: string; department: string | null; avatarUrl: string | null };
  office: { name: string; latitude: number; longitude: number; radiusMeters: number } | null;
  evidence: Evidence[];
}

export function AttendanceDetail({ id, onReviewed }: { id: string; onReviewed?: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "attendance", id],
    queryFn: () => api.get<Detail>(`/admin/attendance/${id}`),
    staleTime: 60_000,
  });
  const review = useMutation({
    mutationFn: (decision: "APPROVE" | "REJECT") => api.post(`/admin/attendance/${id}/review`, { decision, note: note || undefined }),
    onSuccess: (_, decision) => {
      toast.success(decision === "APPROVE" ? "Attendance approved" : "Attendance rejected");
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin"] });
      onReviewed?.();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-10 w-60" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="aspect-[4/5]" />
          <Skeleton className="aspect-[4/5]" />
        </div>
        <Skeleton className="h-56" />
      </div>
    );
  }

  const markers = data.evidence.map((e) => ({
    latitude: e.latitude,
    longitude: e.longitude,
    accuracy: e.accuracyMeters,
    label: e.type === "CHECK_IN" ? "Check-in" : "Check-out",
    tone: (e.withinGeofence ? "success" : "danger") as "success" | "danger",
  }));

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PersonCell
          name={data.employee.name}
          src={data.employee.avatarUrl}
          subtitle={`${data.employee.employeeCode} · ${data.employee.designation}${data.employee.department ? ` · ${data.employee.department}` : ""}`}
        />
        <div className="flex items-center gap-2">
          <StatusBadge status={data.status} />
          <StatusBadge status={data.verificationStatus} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border p-3.5 text-[13px] sm:grid-cols-4">
        <div>
          <div className="text-xs text-muted-foreground">Work date</div>
          <div className="font-medium">{fmtDate(data.workDate, { weekday: "short" })}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Shift</div>
          <div className="font-medium">{data.scheduleSnapshot?.name ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Worked</div>
          <div className="font-medium tabular">{data.checkOutAt ? minutesToHuman(data.workedMinutes) : "In progress"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Risk score</div>
          <div className={cn("font-medium tabular", data.riskScore >= 40 ? "text-danger" : data.riskScore > 0 ? "text-warning" : "text-success")}>
            {data.riskScore}/100
          </div>
        </div>
      </div>

      {(data.flags.length > 0 || data.isLate || data.isEarlyDeparture || data.isRemote) && (
        <div className="flex flex-wrap gap-1.5">
          {data.flags.map((f) => (
            <Pill key={f} tone="warning">
              {ATTENDANCE_FLAG_LABELS[f] ?? f}
            </Pill>
          ))}
          {data.isLate && <Pill tone="warning">{data.lateMinutes} min late</Pill>}
          {data.isEarlyDeparture && <Pill tone="info">Left {data.earlyMinutes} min early</Pill>}
          {data.isRemote && <Pill tone="brand">Remote</Pill>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(["CHECK_IN", "CHECK_OUT"] as const).map((type) => {
          const e = data.evidence.find((x) => x.type === type);
          return (
            <div key={type} className="overflow-hidden rounded-xl border">
              <div className="relative aspect-[4/5] bg-muted">
                {e?.selfie?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.selfie.url} alt={`${type === "CHECK_IN" ? "Check-in" : "Check-out"} selfie`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                    <ImageOff className="size-5" />
                    {!e ? "Not checked out" : e.selfie?.purged ? "Deleted per retention policy" : "No selfie"}
                  </div>
                )}
                <span className="absolute top-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
                  {type === "CHECK_IN" ? "Check-in" : "Check-out"}
                </span>
              </div>
              {e && (
                <dl className="grid gap-1.5 p-3 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="flex items-center gap-1 text-muted-foreground"><Clock3 className="size-3" />Server time</dt>
                    <dd className="font-medium tabular">{fmtDateTime(e.recordedAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="flex items-center gap-1 text-muted-foreground"><MapPin className="size-3" />Distance</dt>
                    <dd className={cn("font-medium tabular", e.withinGeofence ? "text-success" : "text-danger")}>
                      {meters(e.distanceMeters)} {e.withinGeofence ? "· inside" : "· outside"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">GPS accuracy</dt>
                    <dd className="font-medium tabular">±{meters(e.accuracyMeters)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Coordinates</dt>
                    <dd className="font-mono text-[11px]">{e.latitude.toFixed(5)}, {e.longitude.toFixed(5)}</dd>
                  </div>
                  {e.clientTimestamp && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Device clock</dt>
                      <dd className="tabular">{fmtDateTime(e.clientTimestamp)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">IP</dt>
                    <dd className="font-mono text-[11px]">{e.ipAddress ?? "—"}</dd>
                  </div>
                </dl>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Location vs. geofence</span>
          {data.office && <span>{data.office.name} · {data.office.radiusMeters} m</span>}
        </div>
        <GeoMap height={240} markers={markers} geofence={data.office ? { ...data.office, label: data.office.name } : null} />
      </div>

      {data.reviewedBy && (
        <div className="rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
          <ShieldCheck className="mr-1 inline size-3.5" />
          Reviewed by <span className="font-medium text-foreground">{data.reviewedBy}</span> on {fmtDateTime(data.reviewedAt)}
          {data.adminNote && <> — “{data.adminNote}”</>}
        </div>
      )}

      <div className="grid gap-2 border-t pt-4">
        <label htmlFor={`note-${id}`} className="text-[13px] font-medium">
          Administrative note <span className="font-normal text-muted-foreground">(optional, shared with the employee on rejection)</span>
        </label>
        <Textarea id={`note-${id}`} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Verified with manager — client site visit" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => review.mutate("REJECT")} disabled={review.isPending} className="text-danger hover:text-danger">
            {review.isPending && review.variables === "REJECT" ? <LoaderCircle className="animate-spin" /> : <X />}
            Reject
          </Button>
          <Button onClick={() => review.mutate("APPROVE")} disabled={review.isPending}>
            {review.isPending && review.variables === "APPROVE" ? <LoaderCircle className="animate-spin" /> : <Check />}
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}
