// Calendar helpers. Calendar days ("YYYY-MM-DD") and wall-clock times ("HH:MM")
// are interpreted in the device's current local time zone; instants are ISO strings.

export const pad = (n) => String(n).padStart(2, "0");

export function localDay(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isDay(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T12:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export const isTime = (v) =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export const isInstant = (v) =>
  typeof v === "string" && v.length <= 40 && Number.isFinite(Date.parse(v));

export function addDays(day, n) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (from, to) =>
  Math.round(
    (Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 86400000,
  );

// ISO weekday 1 (Monday) … 7 (Sunday) of a calendar day.
export function weekday(day) {
  const w = new Date(day + "T12:00:00Z").getUTCDay();
  return w === 0 ? 7 : w;
}

// Local wall-clock date+time → Date. During a DST gap the JS engine moves the
// time forward (02:30 → 03:30 in Europe/Warsaw); during an overlap it picks
// the first occurrence. Both are documented scheduling rules.
export function wallClock(day, time) {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export const dayOfInstant = (iso) => localDay(new Date(iso));
