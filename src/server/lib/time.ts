/**
 * Timezone helpers built on Intl (no extra deps). All "dates" are YYYY-MM-DD
 * strings in the company timezone; Prisma @db.Date values are UTC-midnight Dates.
 */

export function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    isoWeekday: weekdayMap[parts.weekday as string] ?? 1,
  };
}

/** YYYY-MM-DD of `date` in `timeZone`. */
export function localDateString(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Minutes since local midnight. */
export function localMinuteOfDay(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

/** Convert YYYY-MM-DD to a UTC-midnight Date (what Prisma stores for @db.Date). */
export function dateOnly(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function toYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number) {
  const d = dateOnly(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return toYmd(d);
}

/** ISO weekday (1=Mon … 7=Sun) of a YYYY-MM-DD date. */
export function isoWeekday(ymd: string) {
  const w = dateOnly(ymd).getUTCDay();
  return w === 0 ? 7 : w;
}

export function eachDay(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Offset (ms) of a zone from UTC at an instant. */
function zoneOffsetMs(instant: Date, timeZone: string) {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant of local `ymd` + `minute` in `timeZone`. */
export function zonedTimeToUtc(ymd: string, minute: number, timeZone: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, Math.floor(minute / 60), minute % 60));
  const offset = zoneOffsetMs(guess, timeZone);
  const result = new Date(guess.getTime() - offset);
  // Re-check once for DST boundaries.
  const offset2 = zoneOffsetMs(result, timeZone);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2);
}

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
