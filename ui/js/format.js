// Localised formatting and small HTML helpers shared by all views.
import { translate } from "../../core/i18n.js";
import { localDay } from "../../core/time.js";

let language = "en";
export const setLanguage = (l) => (language = l);
export const lang = () => language;
export const t = (key, vars) => translate(language, key, vars);
const locale = () => (language === "pl" ? "pl-PL" : "en-GB");

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const fmtDay = (day, style = "medium") =>
  new Intl.DateTimeFormat(locale(), { dateStyle: style }).format(new Date(day + "T12:00:00"));
export const fmtDateTime = (iso) =>
  new Intl.DateTimeFormat(locale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
export const fmtTime = (iso) => new Intl.DateTimeFormat(locale(), { timeStyle: "short" }).format(new Date(iso));
export const fmtWeekday = (n) =>
  new Intl.DateTimeFormat(locale(), { weekday: "short" }).format(new Date(Date.UTC(2024, 0, n))); // 2024-01-01 is a Monday

// Value for <input type="datetime-local"> in local time.
export function localInputValue(iso) {
  const d = new Date(iso);
  return `${localDay(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export const specialtyLabel = (d) => (d.specialty === "other" ? d.specialtyCustom : t("specialty." + d.specialty));
export const doctorLabel = (d) => [specialtyLabel(d), d.name].filter(Boolean).join(" · ");
export const symptomLabel = (r) => (r.symptom === "custom" ? r.customLabel : t("symptom." + r.symptom));
export const intensityLabel = (n) => t("intensity." + n);

export function durationLabel(min) {
  if (!min) return "";
  if (min < 60) return t("unit.minutes", { n: min });
  if (min < 1440) return t("unit.hours", { n: Math.round((min / 60) * 10) / 10 });
  return t("unit.days", { n: Math.round((min / 1440) * 10) / 10 });
}

export function attrs(o) {
  return Object.entries(o)
    .filter(([, v]) => v !== false && v != null)
    .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`))
    .join(" ");
}

// <button> with a data-action and optional data-* payload.
export function button(label, action, { cls = "secondary", data = {}, disabled = false, pressed, title } = {}) {
  const d = Object.fromEntries(Object.entries(data).map(([k, v]) => ["data-" + k, v]));
  return `<button type="button" ${attrs({ class: cls, "data-action": action, ...d, disabled, "aria-pressed": pressed === undefined ? null : String(pressed), title })}>${label}</button>`;
}

export const icon = (name) => `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">${ICONS[name] ?? ""}</svg>`;
// Line icons redrawn after the colleague's mock-ups (24px grid, round caps).
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  journal: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  doctor: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  pill: '<rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-35 12 12.5)"/><path d="M9.5 8.5l5 7"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16l3-5 3 3 4-7"/>',
  report: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
};
