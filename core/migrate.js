// Migration of stored data to the current schema.
// v1 (app 0.4.0): one optional visit, symptom events and daily answers tied to it.
// v2: doctors, observations, visits and many-to-many symptom links.
// The caller (src/persistence.cjs) writes a byte-for-byte backup of the original
// file before the migrated state is committed.
import { SCHEMA_VERSION, emptyState } from "./schema.js";
import { validateState, fail } from "./validate.js";
import { isDay, isInstant } from "./time.js";

const V1_SPECIALISTS = ["cardiologist", "neurologist", "endocrinologist", "orthopedist"];
const V1_SYMPTOMS = ["palpitations", "dizziness", "dyspnea", "headache", "pain", "fatigue"];
const V1_FREQUENCIES = ["none", "once", "several"];

export function detectVersion(raw) {
  if (raw && typeof raw === "object") {
    if (raw.schemaVersion === SCHEMA_VERSION) return SCHEMA_VERSION;
    if (raw.version === 1 && !("schemaVersion" in raw)) return 1;
    if (Number.isInteger(raw.schemaVersion) && raw.schemaVersion > SCHEMA_VERSION) return raw.schemaVersion;
  }
  return null;
}

// Strict check of the 0.4.0 format (mirrors the old src/store.cjs validate()).
export function validateV1(s) {
  const str = (v) => typeof v === "string" && v.length <= 2000;
  if (!s || s.version !== 1 || !["en", "pl"].includes(s.language) || !Array.isArray(s.events) || !Array.isArray(s.answers))
    fail("V1_SHAPE");
  if (s.visit) {
    const v = s.visit;
    if (typeof v.id !== "string" || !v.id || !V1_SPECIALISTS.includes(v.specialist) || !isDay(v.date) || !str(v.reason) || !v.reason.trim())
      fail("V1_VISIT");
  }
  const ids = new Set();
  for (const e of s.events) {
    if (!s.visit || e.visitID !== s.visit.id || typeof e.id !== "string" || ids.has(e.id) || !isInstant(e.timestamp) || !V1_SYMPTOMS.includes(e.symptom) || !str(e.note))
      fail("V1_EVENT");
    ids.add(e.id);
  }
  const answers = new Set();
  for (const a of s.answers) {
    if (!s.visit || a.visitID !== s.visit.id || answers.has(a.id) || a.id !== `${a.visitID}/${a.symptom}/${a.date}` || !isDay(a.date) || !V1_SYMPTOMS.includes(a.symptom) || !V1_FREQUENCIES.includes(a.frequency) || !str(a.note))
      fail("V1_ANSWER");
    answers.add(a.id);
  }
  return s;
}

// Returns { state, report } — report holds counts only (safe to log/show).
export function migrateV1(v1, { now = new Date(), newId }) {
  validateV1(v1);
  const at = now.toISOString();
  const s = emptyState();
  s.settings.language = v1.language;
  const report = { from: 1, to: SCHEMA_VERSION, doctors: 0, observations: 0, visits: 0, entries: 0, dailyRatings: 0 };
  if (v1.visit) {
    const v = v1.visit;
    const created = isInstant(v.createdAt) ? v.createdAt : at;
    const doctorId = newId();
    // v0.4 had no doctor entity: the specialist becomes an unnamed doctor.
    s.doctors.push({ id: doctorId, specialty: v.specialist, specialtyCustom: "", name: "", clinic: "", note: "", archivedAt: null, createdAt: created, updatedAt: at });
    // The v0.4 visit ID is kept as the observation ID so old exports stay traceable.
    s.observations.push({
      id: v.id, doctorId, reason: v.reason.trim(), questions: "", stage: "waiting",
      stageHistory: [{ stage: "waiting", at: created }],
      previousObservationId: null, archivedAt: null, createdAt: created, updatedAt: at,
    });
    s.visits.push({ id: newId(), observationId: v.id, date: v.date, time: null, kind: "initial", status: "planned", previousVisitId: null, outcome: null, createdAt: created, updatedAt: at });
    report.doctors = report.observations = report.visits = 1;
    for (const e of v1.events) {
      // v0.4 stored the click time as the only timestamp; it is both event and creation time.
      s.entries.push({
        id: e.id, symptom: e.symptom, customLabel: "", occurredAt: e.timestamp,
        createdAt: e.timestamp, updatedAt: at, note: e.note.trim(),
        durationMinutes: null, intensity: null, count: null, trigger: "",
        observationIds: [v.id],
      });
    }
    for (const a of v1.answers) {
      s.dailyRatings.push({
        id: a.id, date: a.date, symptom: a.symptom, customLabel: "", frequency: a.frequency,
        note: a.note.trim(), observationIds: [v.id], createdAt: at, updatedAt: at,
      });
    }
    report.entries = s.entries.length;
    report.dailyRatings = s.dailyRatings.length;
  }
  return { state: validateState(s), report };
}

// Raw parsed JSON → current state. Unknown/newer versions are refused, never guessed.
export function upgrade(raw, opts) {
  const version = detectVersion(raw);
  if (version === SCHEMA_VERSION) return { state: validateState(raw), report: null };
  if (version === 1) return migrateV1(raw, opts);
  if (version > SCHEMA_VERSION) fail("NEWER_SCHEMA");
  fail("UNKNOWN_FORMAT");
}
