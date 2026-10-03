// Whole-state validation for schema v2. Every load, import and command result
// passes through validateState before it is written or shown.
// Errors carry only a structural code (never user text) so they are safe to log.
import {
  SCHEMA_VERSION,
  LANGUAGES,
  SPECIALTIES,
  SYMPTOMS,
  STAGES,
  FREQUENCIES,
  INTENSITIES,
  VISIT_KINDS,
  VISIT_STATUSES,
  PRESCRIPTION_KINDS,
  SOURCES,
  DOSE_STATUSES,
  RATINGS,
  COUNTRIES,
  ATTACHMENT_TYPES,
  MAX_TEXT,
} from "./schema.js";
import { isDay, isTime, isInstant } from "./time.js";

export class DataError extends Error {
  constructor(code) {
    super("INVALID_DATA");
    this.code = code;
  }
}
export const fail = (code) => {
  throw new DataError(code);
};

export const text = (v, code, max = MAX_TEXT) =>
  typeof v === "string" && v.length <= max ? v.trim() : fail(code);
export const required = (v, code, max) => text(v, code, max) || fail(code);
export const member = (v, list, code) => (list.includes(v) ? v : fail(code));
export const day = (v, code) => (isDay(v) ? v : fail(code));
export const optDay = (v, code) => (v == null || v === "" ? null : day(v, code));
export const instant = (v, code) => (isInstant(v) ? v : fail(code));
export const optInstant = (v, code) => (v == null ? null : instant(v, code));
export const id = (v, code) =>
  typeof v === "string" && /^[\w@:./\-]{1,120}$/.test(v) ? v : fail(code);
export const bool = (v, code) => (typeof v === "boolean" ? v : fail(code));
export function optInt(v, min, max, code) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fail(code);
}

function unique(list, code) {
  if (!Array.isArray(list)) fail(code);
  const ids = new Set();
  for (const item of list) {
    if (!item || typeof item !== "object") fail(code);
    id(item.id, code);
    if (ids.has(item.id)) fail(code + "_DUPLICATE");
    ids.add(item.id);
  }
  return ids;
}

function stamps(o, code) {
  instant(o.createdAt, code);
  instant(o.updatedAt, code);
}

export function doseId(courseId, date, time) {
  return `${courseId}@${date}T${time}`;
}

export const symptomKey = (s) =>
  s.symptom === "custom" ? "custom:" + s.customLabel.toLocaleLowerCase() : s.symptom;

export function validateState(s) {
  if (!s || typeof s !== "object" || s.schemaVersion !== SCHEMA_VERSION)
    fail("SCHEMA_VERSION");
  const st = s.settings;
  if (!st || typeof st !== "object") fail("SETTINGS");
  member(st.language, LANGUAGES, "LANGUAGE");
  bool(st.notificationsEnabled, "SETTINGS");
  bool(st.notificationDetails, "SETTINGS");
  if (st.country !== null) member(st.country, COUNTRIES, "COUNTRY");

  const doctors = unique(s.doctors, "DOCTOR");
  for (const d of s.doctors) {
    member(d.specialty, SPECIALTIES, "DOCTOR_SPECIALTY");
    text(d.specialtyCustom, "DOCTOR", 120);
    if (d.specialty === "other" && !d.specialtyCustom.trim()) fail("DOCTOR_SPECIALTY");
    for (const k of ["name", "clinic"]) text(d[k], "DOCTOR", 200);
    text(d.note, "DOCTOR");
    optInstant(d.archivedAt, "DOCTOR");
    stamps(d, "DOCTOR");
  }

  const observations = unique(s.observations, "OBSERVATION");
  for (const o of s.observations) {
    if (!doctors.has(o.doctorId)) fail("OBSERVATION_DOCTOR");
    required(o.reason, "OBSERVATION_REASON");
    text(o.questions, "OBSERVATION");
    member(o.stage, STAGES, "OBSERVATION_STAGE");
    if (!Array.isArray(o.stageHistory) || !o.stageHistory.length) fail("OBSERVATION_STAGE");
    for (const h of o.stageHistory) {
      member(h.stage, STAGES, "OBSERVATION_STAGE");
      instant(h.at, "OBSERVATION_STAGE");
    }
    if (o.stageHistory.at(-1).stage !== o.stage) fail("OBSERVATION_STAGE");
    if (o.previousObservationId !== null && (!observations.has(o.previousObservationId) || o.previousObservationId === o.id))
      fail("OBSERVATION_PREVIOUS");
    optInstant(o.archivedAt, "OBSERVATION");
    stamps(o, "OBSERVATION");
  }

  const visits = unique(s.visits, "VISIT");
  for (const v of s.visits) {
    if (!observations.has(v.observationId)) fail("VISIT_OBSERVATION");
    day(v.date, "VISIT_DATE");
    if (v.time !== null && !isTime(v.time)) fail("VISIT_TIME");
    member(v.kind, VISIT_KINDS, "VISIT_KIND");
    member(v.status, VISIT_STATUSES, "VISIT_STATUS");
    if (v.previousVisitId !== null && (!visits.has(v.previousVisitId) || v.previousVisitId === v.id))
      fail("VISIT_PREVIOUS");
    if (v.outcome !== null) {
      const o = v.outcome;
      if (typeof o !== "object") fail("VISIT_OUTCOME");
      for (const k of ["notes", "recommendations", "returnAdvice"]) text(o[k], "VISIT_OUTCOME");
      optDay(o.followUpDate, "VISIT_OUTCOME");
      member(o.source, SOURCES, "VISIT_OUTCOME");
    }
    stamps(v, "VISIT");
  }

  const prescriptions = unique(s.prescriptions, "PRESCRIPTION");
  for (const p of s.prescriptions) {
    if (!visits.has(p.visitId)) fail("PRESCRIPTION_VISIT");
    member(p.kind, PRESCRIPTION_KINDS, "PRESCRIPTION_KIND");
    required(p.text, "PRESCRIPTION_TEXT");
    optDay(p.dueDate, "PRESCRIPTION_DUE");
    member(p.source, SOURCES, "PRESCRIPTION_SOURCE");
    stamps(p, "PRESCRIPTION");
  }

  const courses = unique(s.courses, "COURSE");
  for (const c of s.courses) {
    if (!observations.has(c.observationId)) fail("COURSE_OBSERVATION");
    if (c.prescriptionId !== null && !prescriptions.has(c.prescriptionId)) fail("COURSE_PRESCRIPTION");
    required(c.name, "COURSE_NAME", 200);
    required(c.dose, "COURSE_DOSE", 200);
    text(c.instructions, "COURSE");
    day(c.startDate, "COURSE_START");
    bool(c.indefinite, "COURSE_END");
    if (c.indefinite ? c.endDate !== null : !isDay(c.endDate) || c.endDate < c.startDate)
      fail("COURSE_END");
    if (!Array.isArray(c.times) || !c.times.length || c.times.length > 12 || !c.times.every(isTime) || new Set(c.times).size !== c.times.length)
      fail("COURSE_TIMES");
    if (!Array.isArray(c.days) || !c.days.length || !c.days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) || new Set(c.days).size !== c.days.length)
      fail("COURSE_DAYS");
    optInstant(c.stoppedAt, "COURSE");
    stamps(c, "COURSE");
  }

  unique(s.doseEvents, "DOSE");
  for (const e of s.doseEvents) {
    if (!courses.has(e.courseId)) fail("DOSE_COURSE");
    day(e.scheduledDate, "DOSE_DATE");
    if (!isTime(e.scheduledTime)) fail("DOSE_TIME");
    if (e.id !== doseId(e.courseId, e.scheduledDate, e.scheduledTime)) fail("DOSE_ID");
    member(e.status, DOSE_STATUSES, "DOSE_STATUS");
    if (e.status === "taken") instant(e.actualAt, "DOSE_ACTUAL");
    else if (e.actualAt !== null) fail("DOSE_ACTUAL");
    if (e.status === "snoozed") instant(e.snoozedUntil, "DOSE_SNOOZE");
    else if (e.snoozedUntil !== null) fail("DOSE_SNOOZE");
    stamps(e, "DOSE");
  }

  const links = (list, code) => {
    if (!Array.isArray(list) || new Set(list).size !== list.length || !list.every((x) => observations.has(x)))
      fail(code);
  };
  unique(s.entries, "ENTRY");
  for (const e of s.entries) {
    member(e.symptom, SYMPTOMS, "ENTRY_SYMPTOM");
    text(e.customLabel, "ENTRY", 120);
    if ((e.symptom === "custom") !== Boolean(e.customLabel)) fail("ENTRY_SYMPTOM");
    instant(e.occurredAt, "ENTRY_TIME");
    stamps(e, "ENTRY");
    text(e.note, "ENTRY");
    text(e.trigger, "ENTRY", 1000);
    optInt(e.durationMinutes, 1, 60 * 24 * 14, "ENTRY_DURATION");
    if (e.intensity !== null) member(e.intensity, INTENSITIES, "ENTRY_INTENSITY");
    optInt(e.count, 1, 1000, "ENTRY_COUNT");
    links(e.observationIds, "ENTRY_LINKS");
  }

  unique(s.dailyRatings, "DAILY");
  const dailyKeys = new Set();
  for (const r of s.dailyRatings) {
    day(r.date, "DAILY_DATE");
    member(r.symptom, SYMPTOMS, "DAILY_SYMPTOM");
    text(r.customLabel, "DAILY", 120);
    if ((r.symptom === "custom") !== Boolean(r.customLabel)) fail("DAILY_SYMPTOM");
    member(r.frequency, FREQUENCIES, "DAILY_FREQUENCY");
    text(r.note, "DAILY");
    links(r.observationIds, "DAILY_LINKS");
    const key = r.date + "/" + symptomKey(r);
    if (dailyKeys.has(key)) fail("DAILY_DUPLICATE");
    dailyKeys.add(key);
    stamps(r, "DAILY");
  }

  unique(s.assessments, "ASSESSMENT");
  const assessmentKeys = new Set();
  for (const a of s.assessments) {
    if (!observations.has(a.observationId)) fail("ASSESSMENT_OBSERVATION");
    day(a.date, "ASSESSMENT_DATE");
    member(a.rating, RATINGS, "ASSESSMENT_RATING");
    text(a.note, "ASSESSMENT");
    const key = a.observationId + "/" + a.date;
    if (assessmentKeys.has(key)) fail("ASSESSMENT_DUPLICATE");
    assessmentKeys.add(key);
    stamps(a, "ASSESSMENT");
  }

  unique(s.attachments, "ATTACHMENT");
  for (const a of s.attachments) {
    if (!visits.has(a.visitId)) fail("ATTACHMENT_VISIT");
    required(a.fileName, "ATTACHMENT_NAME", 255);
    if (!(a.mime in ATTACHMENT_TYPES)) fail("ATTACHMENT_TYPE");
    if (!Number.isInteger(a.size) || a.size < 0) fail("ATTACHMENT_SIZE");
    if (typeof a.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(a.sha256)) fail("ATTACHMENT_HASH");
    member(a.source, SOURCES, "ATTACHMENT_SOURCE");
    text(a.note, "ATTACHMENT");
    instant(a.addedAt, "ATTACHMENT");
  }
  return s;
}
