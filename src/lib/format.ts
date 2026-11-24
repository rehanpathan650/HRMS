export function minutesToHuman(min: number | null | undefined, opts: { short?: boolean } = {}) {
  if (min == null) return "—";
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (opts.short) return h ? `${h}h ${String(r).padStart(2, "0")}m` : `${r}m`;
  return `${h}h ${String(r).padStart(2, "0")}m`;
}

export function durationClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function fmtTime(iso: string | null | undefined, tz?: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(iso));
}

export function fmtDate(ymdOrIso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!ymdOrIso) return "—";
  const d = ymdOrIso.length === 10 ? new Date(`${ymdOrIso}T00:00:00Z`) : new Date(ymdOrIso);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: ymdOrIso.length === 10 ? "UTC" : undefined,
    ...opts,
  }).format(d);
}

export function fmtDateTime(iso: string | null | undefined, tz?: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(iso));
}

export function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diff) < 60) return "just now";
  if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  if (Math.abs(diff) < 86400 * 7) return rtf.format(-Math.round(diff / 86400), "day");
  return fmtDate(iso);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function meters(m: number | null | undefined) {
  if (m == null) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}

/** Local YYYY-MM-DD of the browser (for default filter values only). */
export function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function shiftYmd(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthRange(ymd: string) {
  const [y, m] = ymd.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from: first, to: last };
}

export function weekRange(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = d.getUTCDay() || 7;
  const from = shiftYmd(ymd, 1 - dow);
  return { from, to: shiftYmd(from, 6) };
}
