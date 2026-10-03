// All data changes go through apply(state, command, payload, ctx).
// Pure: returns a new validated state; never touches the file system.
// ctx = { now: Date, newId: () => string }.
import {
  SPECIALTIES, SYMPTOMS, STAGES, FREQUENCIES, INTENSITIES, VISIT_KINDS,
  VISIT_STATUSES, PRESCRIPTION_KINDS, SOURCES, DOSE_STATUSES, RATINGS,
  LANGUAGES, COUNTRIES, ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES,
} from "./schema.js";
import {
  validateState, fail, text, required, member, day, optDay, instant, id,
  bool, optInt, doseId, symptomKey,
} from "./validate.js";
import { isTime } from "./time.js";

const find = (list, value, code) => list.find((x) => x.id === value) ?? fail(code);
const upsert = (list, item) => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) list.push(item);
  else list[i] = item;
};
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : fail("PAYLOAD"));

function observationLinks(s, list) {
  if (list == null) return [];
  if (!Array.isArray(list)) fail("LINKS");
  const out = [...new Set(list.map((x) => id(x, "LINKS")))];
  for (const x of out) find(s.observations, x, "LINKS");
  return out;
}

function symptomFields(p) {
  const symptom = member(p.symptom, SYMPTOMS, "SYMPTOM");
  const customLabel = symptom === "custom" ? required(p.customLabel, "SYMPTOM", 120) : "";
  return { symptom, customLabel };
}

// Deletion consequences, shown to the user before any cascading delete.
export function deletionImpact(s, kind, targetId) {
  const obsIds =
    kind === "doctor"
      ? s.observations.filter((o) => o.doctorId === targetId).map((o) => o.id)
      : kind === "observation" ? [targetId] : [];
  const visitIds = s.visits.filter((v) => obsIds.includes(v.observationId)).map((v) => v.id);
  const courseIds =
    kind === "course" ? [targetId] : s.courses.filter((c) => obsIds.includes(c.observationId)).map((c) => c.id);
  const linked = (r) => r.observationIds.some((x) => obsIds.includes(x));
  const onlyLinked = (r) => r.observationIds.length > 0 && r.observationIds.every((x) => obsIds.includes(x));
  return {
    observations: obsIds.length,
    visits: visitIds.length,
    prescriptions: s.prescriptions.filter((p) => visitIds.includes(p.visitId)).length,
    attachments: s.attachments.filter((a) => visitIds.includes(a.visitId)).length,
    courses: courseIds.length,
    doseEvents: s.doseEvents.filter((e) => courseIds.includes(e.courseId)).length,
    assessments: s.assessments.filter((a) => obsIds.includes(a.observationId)).length,
    // Symptom records are never deleted by a cascade: they are only unlinked.
    entriesUnlinked: s.entries.filter(linked).length,
    entriesBecomeGeneral: s.entries.filter(onlyLinked).length + s.dailyRatings.filter(onlyLinked).length,
  };
}

function removeObservations(s, obsIds) {
  const visitIds = s.visits.filter((v) => obsIds.includes(v.observationId)).map((v) => v.id);
  const courseIds = s.courses.filter((c) => obsIds.includes(c.observationId)).map((c) => c.id);
  const removedAttachments = s.attachments.filter((a) => visitIds.includes(a.visitId));
  s.observations = s.observations
    .filter((o) => !obsIds.includes(o.id))
    .map((o) => (obsIds.includes(o.previousObservationId) ? { ...o, previousObservationId: null } : o));
  s.visits = s.visits.filter((v) => !visitIds.includes(v.id));
  s.prescriptions = s.prescriptions.filter((p) => !visitIds.includes(p.visitId));
  s.attachments = s.attachments.filter((a) => !visitIds.includes(a.visitId));
  s.courses = s.courses.filter((c) => !courseIds.includes(c.id));
  s.doseEvents = s.doseEvents.filter((e) => !courseIds.includes(e.courseId));
  s.assessments = s.assessments.filter((a) => !obsIds.includes(a.observationId));
  const unlink = (r) => ({ ...r, observationIds: r.observationIds.filter((x) => !obsIds.includes(x)) });
  s.entries = s.entries.map(unlink);
  s.dailyRatings = s.dailyRatings.map(unlink);
  return removedAttachments;
}

const handlers = {
  "settings.update"(s, p) {
    obj(p);
    if ("language" in p) s.settings.language = member(p.language, LANGUAGES, "LANGUAGE");
    if ("notificationsEnabled" in p) s.settings.notificationsEnabled = bool(p.notificationsEnabled, "SETTINGS");
    if ("notificationDetails" in p) s.settings.notificationDetails = bool(p.notificationDetails, "SETTINGS");
    if ("country" in p) s.settings.country = p.country === null ? null : member(p.country, COUNTRIES, "COUNTRY");
  },

  "doctor.save"(s, p, { at, newId }) {
    obj(p);
    const old = p.id ? find(s.doctors, p.id, "DOCTOR") : null;
    const specialty = member(p.specialty, SPECIALTIES, "DOCTOR_SPECIALTY");
    const doctor = {
      id: old?.id ?? newId(),
      specialty,
      specialtyCustom: specialty === "other" ? required(p.specialtyCustom, "DOCTOR_SPECIALTY", 120) : "",
      name: text(p.name ?? "", "DOCTOR", 200),
      clinic: text(p.clinic ?? "", "DOCTOR", 200),
      note: text(p.note ?? "", "DOCTOR"),
      archivedAt: old?.archivedAt ?? null,
      createdAt: old?.createdAt ?? at,
      updatedAt: at,
    };
    upsert(s.doctors, doctor);
    return doctor.id;
  },
  "doctor.archive"(s, p, { at }) {
    const d = find(s.doctors, obj(p).id, "DOCTOR");
    d.archivedAt = bool(p.archived, "DOCTOR") ? (d.archivedAt ?? at) : null;
    d.updatedAt = at;
  },
  "doctor.delete"(s, p) {
    const d = find(s.doctors, obj(p).id, "DOCTOR");
    const removed = removeObservations(s, s.observations.filter((o) => o.doctorId === d.id).map((o) => o.id));
    s.doctors = s.doctors.filter((x) => x.id !== d.id);
    return { removedAttachments: removed.map((a) => a.id) };
  },

  "observation.save"(s, p, { at, newId }) {
    obj(p);
    const old = p.id ? find(s.observations, p.id, "OBSERVATION") : null;
    const doctor = find(s.doctors, p.doctorId, "OBSERVATION_DOCTOR");
    const previous = p.previousObservationId ? find(s.observations, p.previousObservationId, "OBSERVATION_PREVIOUS").id : (old?.previousObservationId ?? null);
    const o = {
      id: old?.id ?? newId(),
      doctorId: doctor.id,
      reason: required(p.reason, "OBSERVATION_REASON"),
      questions: text(p.questions ?? old?.questions ?? "", "OBSERVATION"),
      stage: old?.stage ?? "waiting",
      stageHistory: old?.stageHistory ?? [{ stage: "waiting", at }],
      previousObservationId: previous,
      archivedAt: old?.archivedAt ?? null,
      createdAt: old?.createdAt ?? at,
      updatedAt: at,
    };
    upsert(s.observations, o);
    // A new observation may be created together with its first visit.
    if (!old && p.visitDate) {
      s.visits.push({
        id: newId(), observationId: o.id, date: day(p.visitDate, "VISIT_DATE"),
        time: p.visitTime ? (isTime(p.visitTime) ? p.visitTime : fail("VISIT_TIME")) : null,
        kind: previous ? "followup" : "initial", status: "planned", previousVisitId: null,
        outcome: null, createdAt: at, updatedAt: at,
      });
    }
    return o.id;
  },
  // Changing the stage never deletes records; a wrong choice can be corrected.
  "observation.stage"(s, p, { at }) {
    const o = find(s.observations, obj(p).id, "OBSERVATION");
    const stage = member(p.stage, STAGES, "OBSERVATION_STAGE");
    if (stage === o.stage) return;
    o.stage = stage;
    o.stageHistory = [...o.stageHistory, { stage, at }].slice(-100);
    o.updatedAt = at;
  },
  "observation.archive"(s, p, { at }) {
    const o = find(s.observations, obj(p).id, "OBSERVATION");
    o.archivedAt = bool(p.archived, "OBSERVATION") ? (o.archivedAt ?? at) : null;
    o.updatedAt = at;
  },
  "observation.delete"(s, p) {
    const o = find(s.observations, obj(p).id, "OBSERVATION");
    return { removedAttachments: removeObservations(s, [o.id]).map((a) => a.id) };
  },

  "visit.save"(s, p, { at, newId }) {
    obj(p);
    const old = p.id ? find(s.visits, p.id, "VISIT") : null;
    const observation = find(s.observations, p.observationId ?? old?.observationId, "VISIT_OBSERVATION");
    const previousVisitId = p.previousVisitId ? find(s.visits, p.previousVisitId, "VISIT_PREVIOUS").id : (old?.previousVisitId ?? null);
    const v = {
      id: old?.id ?? newId(),
      observationId: observation.id,
      date: day(p.date, "VISIT_DATE"),
      time: p.time ? (isTime(p.time) ? p.time : fail("VISIT_TIME")) : null,
      kind: member(p.kind ?? old?.kind ?? (previousVisitId ? "followup" : "initial"), VISIT_KINDS, "VISIT_KIND"),
      status: member(p.status ?? old?.status ?? "planned", VISIT_STATUSES, "VISIT_STATUS"),
      previousVisitId,
      outcome: old?.outcome ?? null,
      createdAt: old?.createdAt ?? at,
      updatedAt: at,
    };
    upsert(s.visits, v);
    return v.id;
  },
  "visit.outcome"(s, p, { at }) {
    const v = find(s.visits, obj(p).id, "VISIT");
    v.outcome = {
      notes: text(p.notes ?? "", "VISIT_OUTCOME"),
      recommendations: text(p.recommendations ?? "", "VISIT_OUTCOME"),
      followUpDate: optDay(p.followUpDate, "VISIT_OUTCOME"),
      returnAdvice: text(p.returnAdvice ?? "", "VISIT_OUTCOME"),
      source: member(p.source ?? "user", SOURCES, "VISIT_OUTCOME"),
    };
    v.status = "done";
    v.updatedAt = at;
  },
  "visit.delete"(s, p) {
    const v = find(s.visits, obj(p).id, "VISIT");
    const presIds = s.prescriptions.filter((x) => x.visitId === v.id).map((x) => x.id);
    const removed = s.attachments.filter((a) => a.visitId === v.id);
    s.visits = s.visits.filter((x) => x.id !== v.id).map((x) => (x.previousVisitId === v.id ? { ...x, previousVisitId: null } : x));
    s.prescriptions = s.prescriptions.filter((x) => x.visitId !== v.id);
    // Courses survive: they keep their observation but lose the prescription link.
    s.courses = s.courses.map((c) => (presIds.includes(c.prescriptionId) ? { ...c, prescriptionId: null } : c));
    s.attachments = s.attachments.filter((a) => a.visitId !== v.id);
    return { removedAttachments: removed.map((a) => a.id) };
  },

  "prescription.save"(s, p, { at, newId }) {
    obj(p);
    const old = p.id ? find(s.prescriptions, p.id, "PRESCRIPTION") : null;
    const visit = find(s.visits, p.visitId ?? old?.visitId, "PRESCRIPTION_VISIT");
    const x = {
      id: old?.id ?? newId(),
      visitId: visit.id,
      kind: member(p.kind, PRESCRIPTION_KINDS, "PRESCRIPTION_KIND"),
      text: required(p.text, "PRESCRIPTION_TEXT"),
      dueDate: optDay(p.dueDate, "PRESCRIPTION_DUE"),
      source: member(p.source ?? "user", SOURCES, "PRESCRIPTION_SOURCE"),
      createdAt: old?.createdAt ?? at,
      updatedAt: at,
    };
    upsert(s.prescriptions, x);
    return x.id;
  },
  "prescription.delete"(s, p) {
    const x = find(s.prescriptions, obj(p).id, "PRESCRIPTION");
    s.prescriptions = s.prescriptions.filter((y) => y.id !== x.id);
    s.courses = s.courses.map((c) => (c.prescriptionId === x.id ? { ...c, prescriptionId: null } : c));
  },

  // A course is recorded exactly as prescribed; nothing is derived from the drug name.
  "course.save"(s, p, { at, newId }) {
    obj(p);
    const old = p.id ? find(s.courses, p.id, "COURSE") : null;
    const observation = find(s.observations, p.observationId ?? old?.observationId, "COURSE_OBSERVATION");
    const prescriptionId = p.prescriptionId ? find(s.prescriptions, p.prescriptionId, "COURSE_PRESCRIPTION").id : null;
    const indefinite = bool(p.indefinite, "COURSE_END");
    const times = Array.isArray(p.times) ? [...new Set(p.times)].sort() : fail("COURSE_TIMES");
    const days = Array.isArray(p.days) ? [...new Set(p.days.map(Number))].sort() : fail("COURSE_DAYS");
    const c = {
      id: old?.id ?? newId(),
      observationId: observation.id,
      prescriptionId,
      name: required(p.name, "COURSE_NAME", 200),
      dose: required(p.dose, "COURSE_DOSE", 200),
      instructions: text(p.instructions ?? "", "COURSE"),
      startDate: day(p.startDate, "COURSE_START"),
      endDate: indefinite ? null : day(p.endDate, "COURSE_END"),
      indefinite,
      times,
      days,
      stoppedAt: old?.stoppedAt ?? null,
      createdAt: old?.createdAt ?? at,
      updatedAt: at,
    };
    upsert(s.courses, c);
    return c.id;
  },
  // Recording that the course ended as written (e.g. the doctor stopped it). Not a recovery claim.
  "course.stop"(s, p, { at }) {
    const c = find(s.courses, obj(p).id, "COURSE");
    c.stoppedAt = bool(p.stopped, "COURSE") ? (c.stoppedAt ?? at) : null;
    c.updatedAt = at;
  },
  "course.delete"(s, p) {
    const c = find(s.courses, obj(p).id, "COURSE");
    s.courses = s.courses.filter((x) => x.id !== c.id);
    s.doseEvents = s.doseEvents.filter((e) => e.courseId !== c.id);
  },

  // Idempotent: the dose ID is derived from course + planned date/time, so
  // pressing "taken" twice updates one record instead of creating a duplicate.
  "dose.mark"(s, p, { at, now }) {
    obj(p);
    const c = find(s.courses, p.courseId, "DOSE_COURSE");
    const date = day(p.date, "DOSE_DATE");
    if (!isTime(p.time) || !c.times.includes(p.time)) fail("DOSE_TIME");
    const status = member(p.status, DOSE_STATUSES, "DOSE_STATUS");
    const key = doseId(c.id, date, p.time);
    const old = s.doseEvents.find((e) => e.id === key);
    let actualAt = null, snoozedUntil = null;
    if (status === "taken") {
      actualAt = instant(p.actualAt ?? at, "DOSE_ACTUAL");
      if (Date.parse(actualAt) > now.getTime() + 60000) fail("DOSE_ACTUAL");
    }
    if (status === "snoozed") {
      const minutes = optInt(p.snoozeMinutes, 5, 240, "DOSE_SNOOZE") ?? fail("DOSE_SNOOZE");
      snoozedUntil = new Date(now.getTime() + minutes * 60000).toISOString();
    }
    upsert(s.doseEvents, {
      id: key, courseId: c.id, scheduledDate: date, scheduledTime: p.time, status,
      actualAt, snoozedUntil, createdAt: old?.createdAt ?? at, updatedAt: at,
    });
    return key;
  },
  // Back to "not marked yet".
  "dose.clear"(s, p) {
    const e = find(s.doseEvents, obj(p).id, "DOSE");
    s.doseEvents = s.doseEvents.filter((x) => x.id !== e.id);
  },

  "entry.save"(s, p, { at, now, newId }) {
    obj(p);
    const old = p.id ? find(s.entries, p.id, "ENTRY") : null;
    const occurredAt = instant(p.occurredAt ?? old?.occurredAt, "ENTRY_TIME");
    if (Date.parse(occurredAt) > now.getTime() + 60000) fail("ENTRY_TIME");
    const e = {
      id: old?.id ?? newId(),
      ...symptomFields(p),
      occurredAt,
      createdAt: old?.createdAt ?? at,
      updatedAt: at,
      note: text(p.note ?? "", "ENTRY"),
      durationMinutes: optInt(p.durationMinutes, 1, 60 * 24 * 14, "ENTRY_DURATION"),
      intensity: p.intensity == null || p.intensity === "" ? null : member(Number(p.intensity), INTENSITIES, "ENTRY_INTENSITY"),
      count: optInt(p.count, 1, 1000, "ENTRY_COUNT"),
      trigger: text(p.trigger ?? "", "ENTRY", 1000),
      observationIds: observationLinks(s, p.observationIds),
    };
    upsert(s.entries, e);
    s.entries.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return e.id;
  },
  "entry.delete"(s, p) {
    const e = find(s.entries, obj(p).id, "ENTRY");
    s.entries = s.entries.filter((x) => x.id !== e.id);
  },

  // One daily summary per calendar day and symptom (upsert).
  "daily.save"(s, p, { at, newId }) {
    obj(p);
    const date = day(p.date, "DAILY_DATE");
    const fields = symptomFields(p);
    const key = symptomKey(fields);
    const old = s.dailyRatings.find((r) => r.date === date && symptomKey(r) === key);
    const r = {
      id: old?.id ?? newId(),
      date,
      ...fields,
      frequency: member(p.frequency, FREQUENCIES, "DAILY_FREQUENCY"),
      note: text(p.note ?? "", "DAILY"),
      observationIds: observationLinks(s, p.observationIds ?? old?.observationIds),
      createdAt: old?.createdAt ?? at,
      updatedAt: at,
    };
    upsert(s.dailyRatings, r);
    s.dailyRatings.sort((a, b) => b.date.localeCompare(a.date));
    return r.id;
  },
  "daily.delete"(s, p) {
    const r = find(s.dailyRatings, obj(p).id, "DAILY");
    s.dailyRatings = s.dailyRatings.filter((x) => x.id !== r.id);
  },

  "assessment.save"(s, p, { at, newId }) {
    obj(p);
    const o = find(s.observations, p.observationId, "ASSESSMENT_OBSERVATION");
    const date = day(p.date, "ASSESSMENT_DATE");
    const old = s.assessments.find((a) => a.observationId === o.id && a.date === date);
    const a = {
      id: old?.id ?? newId(), observationId: o.id, date,
      rating: member(p.rating, RATINGS, "ASSESSMENT_RATING"),
      note: text(p.note ?? "", "ASSESSMENT"),
      createdAt: old?.createdAt ?? at, updatedAt: at,
    };
    upsert(s.assessments, a);
    s.assessments.sort((x, y) => y.date.localeCompare(x.date));
    return a.id;
  },

  // Metadata only; the main process stores the bytes before calling this.
  "attachment.add"(s, p, { at }) {
    obj(p);
    const v = find(s.visits, p.visitId, "ATTACHMENT_VISIT");
    if (!(p.mime in ATTACHMENT_TYPES)) fail("ATTACHMENT_TYPE");
    if (!Number.isInteger(p.size) || p.size < 0 || p.size > MAX_ATTACHMENT_BYTES) fail("ATTACHMENT_SIZE");
    const a = {
      id: id(p.id, "ATTACHMENT"), visitId: v.id, fileName: required(p.fileName, "ATTACHMENT_NAME", 255),
      mime: p.mime, size: p.size, sha256: p.sha256, source: "document",
      note: text(p.note ?? "", "ATTACHMENT"), addedAt: at,
    };
    if (s.attachments.some((x) => x.id === a.id)) fail("ATTACHMENT_DUPLICATE");
    s.attachments.push(a);
    return a.id;
  },
  "attachment.delete"(s, p) {
    const a = find(s.attachments, obj(p).id, "ATTACHMENT");
    s.attachments = s.attachments.filter((x) => x.id !== a.id);
    return { removedAttachments: [a.id] };
  },
};

export const COMMANDS = Object.keys(handlers);

export function apply(state, command, payload, ctx) {
  const handler = Object.hasOwn(handlers, command) ? handlers[command] : fail("COMMAND");
  const next = structuredClone(state);
  const now = ctx.now ?? new Date();
  const result = handler(next, payload, { ...ctx, now, at: now.toISOString() });
  return { state: validateState(next), result: result ?? null };
}
