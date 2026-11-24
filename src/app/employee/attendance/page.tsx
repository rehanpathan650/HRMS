"use client";

import { Camera, CircleCheck, Clock3, LogIn, LogOut, MapPin, ShieldCheck, TriangleAlert } from "lucide-react";
import { AttendanceCard, useToday } from "@/components/attendance/attendance-card";
import { AttendanceCalendar } from "@/components/attendance/attendance-calendar";
import { PageHeader, SectionCard } from "@/components/shared/page-header";
import { Pill } from "@/components/shared/status-badge";
import { GeoMap } from "@/components/map/geo-map";
import { useMySummary } from "@/hooks/use-employee-data";
import { useGsapReveal } from "@/hooks/use-gsap-reveal";
import { fmtTime, meters, minutesToHuman, monthRange, todayYmd } from "@/lib/format";
import { ATTENDANCE_FLAG_LABELS } from "@/lib/constants";

export default function EmployeeAttendancePage() {
  const today = useToday();
  const t = today.data;
  const a = t?.attendance;
  const range = monthRange(t?.workDate ?? todayYmd());
  const summary = useMySummary(range.from, range.to);
  const scope = useGsapReveal(!!t);

  const events = [
    a && { icon: LogIn, title: "Checked in", time: fmtTime(a.checkInAt, t?.timezone), detail: a.isLate ? `${a.lateMinutes} min late` : "On time" },
    a?.checkOutAt && {
      icon: LogOut,
      title: "Checked out",
      time: fmtTime(a.checkOutAt, t?.timezone),
      detail: `${minutesToHuman(a.workedMinutes)} worked${a.isEarlyDeparture ? ` · left ${a.earlyMinutes} min early` : ""}`,
    },
    a?.verificationStatus === "APPROVED" && { icon: CircleCheck, title: "Verified by admin", time: "", detail: a.adminNote ?? "" },
  ].filter(Boolean) as { icon: typeof LogIn; title: string; time: string; detail: string }[];

  return (
    <div ref={scope} className="grid gap-6">
      <PageHeader title="Attendance" description="Check in and out with location and selfie verification." />
      <AttendanceCard />

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Today's timeline" className="lg:col-span-1">
          {!events.length ? (
            <p className="text-sm text-muted-foreground">No activity yet today.</p>
          ) : (
            <ol className="relative grid gap-5 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-border">
              {events.map((e) => (
                <li key={e.title} className="relative flex gap-3">
                  <span className="z-10 grid size-8 shrink-0 place-items-center rounded-full border bg-card">
                    <e.icon className="size-3.5 text-muted-foreground" />
                  </span>
                  <div>
                    <div className="text-[13px] font-medium">
                      {e.title} {e.time && <span className="text-muted-foreground tabular">· {e.time}</span>}
                    </div>
                    {e.detail && <div className="text-xs text-muted-foreground">{e.detail}</div>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {!!a?.flags.length && (
            <div className="mt-5 border-t pt-4">
              <div className="mb-2 text-xs font-medium text-muted-foreground">Verification signals</div>
              <div className="flex flex-wrap gap-1.5">
                {a.flags.map((f) => (
                  <Pill key={f} tone="warning">
                    {ATTENDANCE_FLAG_LABELS[f] ?? f}
                  </Pill>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Your office" description={t?.office ? `${t.office.name} · ${meters(t.office.radiusMeters)} check-in radius` : "No office configured"}>
          {t?.office ? (
            <GeoMap height={220} geofence={{ ...t.office, label: t.office.name }} />
          ) : (
            <p className="text-sm text-muted-foreground">Your administrator hasn&apos;t configured an office location yet.</p>
          )}
        </SectionCard>

        <SectionCard title="How verification works">
          <ul className="grid gap-4 text-[13px]">
            {[
              { I: MapPin, t: "Location", d: `Your GPS position must be within the office radius${t?.policy.allowRemote ? " (remote check-in is allowed for you and is reviewed)" : ""}.` },
              { I: Camera, t: "Live selfie", d: "Captured with your camera at check-in. Gallery uploads aren't accepted." },
              { I: Clock3, t: "Server time", d: "The official timestamp comes from our server, not your device." },
              { I: TriangleAlert, t: "Review", d: "Low GPS accuracy or unusual patterns send a record to an administrator for review." },
              { I: ShieldCheck, t: "Privacy", d: "Selfies and coordinates are visible only to you and administrators." },
            ].map(({ I, t: title, d }) => (
              <li key={title} className="flex gap-3">
                <I className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <div className="font-medium">{title}</div>
                  <div className="text-xs text-muted-foreground">{d}</div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="This month">
        <div className="max-w-md">
          <AttendanceCalendar month={range.from} days={summary.data?.days} loading={summary.isLoading} timezone={t?.timezone} today={t?.workDate} />
        </div>
      </SectionCard>
    </div>
  );
}
