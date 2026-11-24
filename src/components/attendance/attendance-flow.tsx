"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  CameraOff,
  Check,
  CircleAlert,
  LoaderCircle,
  LocateFixed,
  MapPin,
  MapPinOff,
  RefreshCw,
  RotateCcw,
  ScanFace,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GeoMap } from "@/components/map/geo-map";
import { useGeolocation, type GeoReading } from "@/hooks/use-geolocation";
import { useCamera } from "@/hooks/use-camera";
import { api, ApiClientError, errorMessage, newIdempotencyKey } from "@/lib/api-client";
import { meters, fmtTime, minutesToHuman } from "@/lib/format";
import type { AttendanceRecord, TodayState } from "@/lib/types";
import { cn } from "@/lib/utils";

type Mode = "check-in" | "check-out";
type Step = "location" | "selfie" | "review" | "done";

const EARTH = 6_371_000;
function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.latitude - a.latitude);
  const dLon = r(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

function Stepper({ steps, current }: { steps: { key: Step; label: string }[]; current: Step }) {
  const idx = steps.findIndex((s) => s.key === current);
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s, i) => (
        <li key={s.key} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded-full border text-[10.5px] font-semibold transition-colors",
              i < idx && "border-success bg-success text-white",
              i === idx && "border-foreground bg-foreground text-background",
              i > idx && "text-muted-foreground",
            )}
          >
            {i < idx ? <Check className="size-3" /> : i + 1}
          </span>
          <span className={cn("hidden text-xs font-medium sm:inline", i === idx ? "text-foreground" : "text-muted-foreground")}>
            {s.label}
          </span>
          {i < steps.length - 1 && <span className={cn("h-px flex-1 bg-border", i < idx && "bg-success/60")} />}
        </li>
      ))}
    </ol>
  );
}

export function AttendanceFlow({
  open,
  onOpenChange,
  mode,
  today,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: Mode;
  today: TodayState;
}) {
  const qc = useQueryClient();
  const geo = useGeolocation();
  const cam = useCamera();
  const selfieRequired = mode === "check-in" || today.policy.requireCheckoutSelfie;
  const [step, setStep] = useState<Step>("location");
  const [reading, setReading] = useState<GeoReading | null>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "upload" | "submit">(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<AttendanceRecord | null>(null);
  const idemKey = useRef<string>(newIdempotencyKey());

  const steps = useMemo(
    () =>
      [
        { key: "location" as Step, label: "Location" },
        ...(selfieRequired || mode === "check-out" ? [{ key: "selfie" as Step, label: selfieRequired ? "Selfie" : "Selfie (optional)" }] : []),
        { key: "review" as Step, label: "Confirm" },
      ],
    [selfieRequired, mode],
  );

  // Reset whenever the dialog opens; request location immediately (user just clicked).
  useEffect(() => {
    if (!open) return;
    setStep("location");
    setReading(null);
    setPhoto(null);
    setUploadId(null);
    setSubmitError(null);
    setResult(null);
    idemKey.current = newIdempotencyKey();
    geo.locate().then((r) => r && setReading(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) cam.stop();
  }, [open, cam]);

  useEffect(() => {
    if (step === "selfie" && !photo) cam.start();
    if (step !== "selfie") cam.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, photo]);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  const office = today.office;
  const distance = reading && office ? Math.round(distanceMeters(reading, office)) : null;
  const inside = distance != null && office ? distance <= office.radiusMeters : false;
  const lowAccuracy = reading ? reading.accuracy > today.policy.maxGpsAccuracyMeters : false;
  const blocked = mode === "check-in" && !!office && !!reading && !inside && !today.policy.allowRemote;

  const relocate = async () => {
    setReading(null);
    const r = await geo.locate();
    if (r) setReading(r);
  };

  const takePhoto = async () => {
    const blob = await cam.capture();
    if (!blob) return toast.error("Could not capture the photo. Please try again.");
    cam.stop();
    setPhoto({ blob, url: URL.createObjectURL(blob) });
    setUploadId(null);
  };

  const retake = () => {
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setUploadId(null);
  };

  const usePhoto = async () => {
    if (!photo) return;
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("selfie", photo.blob, "selfie.jpg");
      const res = await api.upload<{ uploadId: string }>("/attendance/selfie", fd);
      setUploadId(res.uploadId);
      setStep("review");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const submit = useCallback(async () => {
    if (!reading) return;
    setBusy("submit");
    setSubmitError(null);
    try {
      const rec = await api.post<AttendanceRecord>(
        `/attendance/${mode}`,
        {
          latitude: reading.latitude,
          longitude: reading.longitude,
          accuracy: reading.accuracy,
          positionTimestamp: Math.round(reading.timestamp),
          ...(uploadId ? { selfieUploadId: uploadId } : {}),
        },
        { idempotencyKey: idemKey.current },
      );
      setResult(rec);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e) {
      // A new key lets the user retry after fixing the cause (e.g. a fresh selfie).
      idemKey.current = newIdempotencyKey();
      const msg = errorMessage(e);
      setSubmitError(msg);
      if (e instanceof ApiClientError && /selfie/i.test(msg)) setUploadId(null);
    } finally {
      setBusy(null);
    }
  }, [reading, uploadId, mode, qc]);

  const title = mode === "check-in" ? "Check in" : "Check out";

  return (
    <Dialog open={open} onOpenChange={(o) => busy === null && onOpenChange(o)}>
      <DialogContent className="max-h-[94dvh] gap-0 overflow-y-auto p-0 sm:max-w-[520px]">
        <div className="border-b px-5 pt-5 pb-4">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="mt-0.5 text-[13px]">
            {mode === "check-in"
              ? "We need your current location and a live selfie to record attendance."
              : "Confirm your location to end today's session."}
          </DialogDescription>
          {step !== "done" && (
            <div className="mt-4">
              <Stepper steps={steps} current={step} />
            </div>
          )}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="p-5"
          >
            {/* ── Location ───────────────────────────────── */}
            {step === "location" && (
              <div className="grid gap-4">
                {geo.state.status === "locating" && (
                  <div className="grid h-[240px] place-items-center rounded-lg border bg-muted/40">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <span className="relative grid size-12 place-items-center">
                        <span className="absolute inset-0 animate-ping rounded-full bg-brand/25" />
                        <LocateFixed className="relative size-6 text-brand" />
                      </span>
                      <div className="text-sm font-medium">Getting your precise location…</div>
                      <div className="text-xs text-muted-foreground">Allow location access if your browser asks.</div>
                    </div>
                  </div>
                )}
                {geo.state.status === "error" && (
                  <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
                    <MapPinOff className="size-7 text-danger" />
                    <p className="max-w-sm text-sm text-muted-foreground">{geo.state.message}</p>
                    <Button variant="outline" size="sm" onClick={relocate}>
                      <RefreshCw /> Try again
                    </Button>
                  </div>
                )}
                {reading && (
                  <>
                    <GeoMap
                      height={240}
                      markers={[{ ...reading, label: "You are here", tone: blocked ? "danger" : inside ? "success" : "warning" }]}
                      geofence={office ? { ...office, label: office.name } : null}
                    />
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg border p-2.5">
                        <div className="text-[11px] text-muted-foreground">Distance</div>
                        <div className={cn("text-sm font-semibold tabular", blocked ? "text-danger" : inside ? "text-success" : "text-warning")}>
                          {office ? meters(distance) : "—"}
                        </div>
                      </div>
                      <div className="rounded-lg border p-2.5">
                        <div className="text-[11px] text-muted-foreground">Accuracy</div>
                        <div className={cn("text-sm font-semibold tabular", lowAccuracy && "text-warning")}>±{meters(reading.accuracy)}</div>
                      </div>
                      <div className="rounded-lg border p-2.5">
                        <div className="text-[11px] text-muted-foreground">Allowed radius</div>
                        <div className="text-sm font-semibold tabular">{office ? meters(office.radiusMeters) : "—"}</div>
                      </div>
                    </div>
                    {blocked && (
                      <div className="flex gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
                        <MapPinOff className="mt-0.5 size-4 shrink-0" />
                        <span>
                          You&apos;re outside the {office!.name} geofence. Move closer to the office and refresh your location. Remote
                          check-in is not enabled for your account.
                        </span>
                      </div>
                    )}
                    {!blocked && office && !inside && (
                      <div className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                        <span>You&apos;re outside the office radius. This will be recorded as remote and sent for review.</span>
                      </div>
                    )}
                    {lowAccuracy && (
                      <div className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                        <span>GPS accuracy is low. Refreshing near a window or enabling precise location usually helps.</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <Button variant="ghost" size="sm" onClick={relocate}>
                        <RefreshCw /> Refresh location
                      </Button>
                      <Button disabled={blocked} onClick={() => setStep(steps[1].key)}>
                        Continue
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Selfie ─────────────────────────────────── */}
            {step === "selfie" && (
              <div className="grid gap-4">
                <div className="relative mx-auto aspect-[4/5] w-full max-w-[300px] overflow-hidden rounded-2xl border bg-zinc-950">
                  {!photo && (
                    <>
                      <video
                        ref={cam.videoRef}
                        playsInline
                        muted
                        autoPlay
                        className="h-full w-full -scale-x-100 object-cover"
                        aria-label="Live camera preview"
                      />
                      {cam.state.status === "live" && (
                        <div className="pointer-events-none absolute inset-0">
                          <svg viewBox="0 0 100 125" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
                            <defs>
                              <mask id="oval">
                                <rect width="100" height="125" fill="white" />
                                <ellipse cx="50" cy="55" rx="30" ry="38" fill="black" />
                              </mask>
                            </defs>
                            <rect width="100" height="125" fill="rgba(0,0,0,0.45)" mask="url(#oval)" />
                            <ellipse cx="50" cy="55" rx="30" ry="38" fill="none" stroke="white" strokeOpacity="0.8" strokeWidth="0.6" strokeDasharray="2 1.5" />
                          </svg>
                          <div className="absolute inset-x-0 bottom-3 text-center text-xs font-medium text-white/90">
                            Center your face in the frame
                          </div>
                        </div>
                      )}
                      {cam.state.status === "starting" && (
                        <div className="absolute inset-0 grid place-items-center text-white/80">
                          <LoaderCircle className="size-6 animate-spin" />
                        </div>
                      )}
                      {cam.state.status === "error" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center text-white">
                          <CameraOff className="size-7 text-red-400" />
                          <p className="text-[13px] text-white/80">{cam.state.message}</p>
                          <Button size="sm" variant="secondary" onClick={cam.start}>
                            <RefreshCw /> Retry camera
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                  {photo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.url} alt="Captured selfie preview" className="h-full w-full object-cover" />
                  )}
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Your photo is stored privately and is visible only to you and administrators.
                </p>
                <div className="flex items-center justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setStep("location")} disabled={busy !== null}>
                    Back
                  </Button>
                  <div className="flex gap-2">
                    {!photo && !selfieRequired && (
                      <Button variant="outline" onClick={() => setStep("review")}>
                        Skip
                      </Button>
                    )}
                    {!photo ? (
                      <Button onClick={takePhoto} disabled={cam.state.status !== "live"}>
                        <Camera /> Capture
                      </Button>
                    ) : (
                      <>
                        <Button variant="outline" onClick={retake} disabled={busy !== null}>
                          <RotateCcw /> Retake
                        </Button>
                        <Button onClick={usePhoto} disabled={busy !== null}>
                          {busy === "upload" ? <LoaderCircle className="animate-spin" /> : <Check />}
                          Use photo
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Review ─────────────────────────────────── */}
            {step === "review" && reading && (
              <div className="grid gap-4">
                <div className="flex gap-4 rounded-xl border p-3">
                  {photo && uploadId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.url} alt="Your selfie" className="h-24 w-[77px] rounded-lg object-cover" />
                  ) : (
                    <div className="grid h-24 w-[77px] place-items-center rounded-lg bg-muted">
                      <ScanFace className="size-5 text-muted-foreground" />
                    </div>
                  )}
                  <dl className="grid flex-1 grid-cols-2 content-center gap-x-4 gap-y-2 text-[13px]">
                    <div>
                      <dt className="text-xs text-muted-foreground">Location</dt>
                      <dd className="font-medium">{office ? (inside ? "Inside geofence" : "Outside geofence") : "Captured"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Distance</dt>
                      <dd className="font-medium tabular">{meters(distance)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Accuracy</dt>
                      <dd className="font-medium tabular">±{meters(reading.accuracy)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Selfie</dt>
                      <dd className="font-medium">{uploadId ? "Attached" : "Not attached"}</dd>
                    </div>
                  </dl>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-px size-3.5 shrink-0" />
                  The official time is recorded by the server when you confirm. Location is a verification signal and may be reviewed by an administrator.
                </div>
                {submitError && (
                  <div className="flex gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-[13px] text-danger" role="alert">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    {submitError}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setStep(steps.length > 2 ? "selfie" : "location")} disabled={busy !== null}>
                    Back
                  </Button>
                  {selfieRequired && !uploadId ? (
                    <Button onClick={() => setStep("selfie")}>
                      <Camera /> Retake selfie
                    </Button>
                  ) : (
                    <Button onClick={submit} disabled={busy !== null} className="min-w-32">
                      {busy === "submit" ? <LoaderCircle className="animate-spin" /> : <MapPin />}
                      Confirm {mode === "check-in" ? "check-in" : "check-out"}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* ── Done ───────────────────────────────────── */}
            {step === "done" && result && (
              <div className="flex flex-col items-center py-4 text-center">
                <motion.div
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  className="grid size-14 place-items-center rounded-full bg-success-soft"
                >
                  <svg viewBox="0 0 24 24" className="size-7 text-success" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <motion.path
                      d="M5 12.5l4.5 4.5L19 7.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.45, delay: 0.15 }}
                    />
                  </svg>
                </motion.div>
                <h3 className="mt-4 text-lg font-semibold">
                  {mode === "check-in" ? "You're checked in" : "You're checked out"}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {mode === "check-in"
                    ? `Recorded at ${fmtTime(result.checkInAt, today.timezone)}${result.isLate ? ` · ${result.lateMinutes} min late` : ""}`
                    : `Worked ${minutesToHuman(result.workedMinutes)} today`}
                </p>
                {result.verificationStatus === "PENDING" && (
                  <p className="mt-3 rounded-md bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
                    Flagged for review — an administrator will verify this record.
                  </p>
                )}
                <Button className="mt-6" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
