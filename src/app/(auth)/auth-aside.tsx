"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { CircleCheck, Clock3, MapPin, ScanFace, ShieldCheck } from "lucide-react";

gsap.registerPlugin(useGSAP);

/** Product illustration for the sign-in screen (decorative, not live data). */
export function AuthAside() {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
        tl.from("[data-a='card']", { y: 24, autoAlpha: 0, duration: 0.8 })
          .from("[data-a='step']", { x: -10, autoAlpha: 0, stagger: 0.12, duration: 0.5 }, "-=0.4")
          .from("[data-a='ring']", { scale: 0.6, autoAlpha: 0, duration: 0.9, ease: "expo.out" }, "-=0.6")
          .from("[data-a='chip']", { y: 8, autoAlpha: 0, stagger: 0.1, duration: 0.45 }, "-=0.5");
        gsap.to("[data-a='pulse']", { scale: 1.6, autoAlpha: 0, duration: 1.8, repeat: -1, ease: "sine.out" });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className="relative hidden overflow-hidden border-l bg-surface lg:block" aria-hidden>
      <div className="absolute inset-0 bg-grid opacity-70 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <div className="relative flex h-full flex-col items-center justify-center px-12">
        <div data-a="card" className="w-full max-w-[400px] rounded-2xl bg-card p-5 card-elevated">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Check-in</div>
              <div className="text-sm font-semibold">Verification pipeline</div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
              <ShieldCheck className="size-3" /> Server-validated
            </span>
          </div>

          <div className="relative mt-5 grid h-40 place-items-center overflow-hidden rounded-xl border bg-muted/50">
            <div className="absolute inset-0 bg-grid opacity-60" />
            <div data-a="ring" className="relative grid size-28 place-items-center rounded-full border border-dashed border-brand/50 bg-brand-soft/50">
              <span data-a="pulse" className="absolute size-5 rounded-full bg-brand/40" />
              <span className="relative size-3.5 rounded-full border-2 border-card bg-brand shadow" />
            </div>
            <span data-a="chip" className="absolute top-3 left-3 rounded-md bg-card px-2 py-1 text-[11px] font-medium shadow-sm">
              200 m geofence
            </span>
            <span data-a="chip" className="absolute right-3 bottom-3 rounded-md bg-card px-2 py-1 text-[11px] font-medium shadow-sm">
              ±12 m accuracy
            </span>
          </div>

          <ul className="mt-5 space-y-2.5">
            {[
              { I: MapPin, t: "GPS location captured", d: "Haversine distance to office" },
              { I: ScanFace, t: "Live selfie captured", d: "Camera only — no gallery uploads" },
              { I: Clock3, t: "Server timestamp applied", d: "Client clocks are never trusted" },
            ].map(({ I, t, d }) => (
              <li data-a="step" key={t} className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-lg border bg-card">
                  <I className="size-4 text-muted-foreground" />
                </span>
                <div className="flex-1">
                  <div className="text-[13px] font-medium">{t}</div>
                  <div className="text-xs text-muted-foreground">{d}</div>
                </div>
                <CircleCheck className="size-4 text-success" />
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-10 max-w-[400px] text-center">
          <h2 className="text-lg font-semibold tracking-tight">Attendance you can actually trust</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Location and selfie evidence, server-side validation, and an immutable audit trail — in one calm workspace.
          </p>
        </div>
      </div>
    </div>
  );
}
