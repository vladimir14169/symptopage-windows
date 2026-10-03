// Read-only derived views used by the UI, the PDF report and tests. Pure.
import { addDays, daysBetween, localDay, dayOfInstant } from "./time.js";
import { plannedDoses } from "./schedule.js";
import { symptomKey } from "./validate.js";

const byId = (list) => new Map(list.map((x) => [x.id, x]));

// filter = { doctorIds: string[] (empty = all doctors), archived: boolean }
export function selectedObservations(state, filter = {}) {
  const doctors = byId(state.doctors);
  return state.observations.filter((o) => {
    const d = doctors.get(o.doctorId);
    if (!filter.archived && (o.archivedAt || d.archivedAt)) return false;
    return !filter.doctorIds?.length || filter.doctorIds.includes(o.doctorId);
  });
}

// Records linked to any of the observations (each record once, however many
// links it has). General (unlinked) records are included when includeGeneral.
export function recordsFor(list, observationIds, { includeGeneral = true } = {}) {
  const set = new Set(observationIds);
  return list.filter((r) =>
    r.observationIds.length ? r.observationIds.some((x) => set.has(x)) : includeGeneral,
  );
}

export function searchEntries(entries, { query = "", symptom = "", from = "", to = "" } = {}) {
  const q = query.trim().toLocaleLowerCase();
  return entries.filter((e) => {
    const d = dayOfInstant(e.occurredAt);
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (symptom && symptomKey(e) !== symptom) return false;
    if (!q) return true;
    return [e.customLabel, e.note, e.trigger].some((x) => x.toLocaleLowerCase().includes(q));
  });
}

// Statistics over user records only. "No record" is reported as missing data,
// never as "no symptom".
export function symptomSummary(entries, ratings, from, to) {
  const inRange = (d) => d >= from && d <= to;
  const totalDays = daysBetween(from, to) + 1;
  const groups = new Map();
  const group = (r) => {
    const k = symptomKey(r);
    if (!groups.has(k))
      groups.set(k, { key: k, symptom: r.symptom, customLabel: r.customLabel, events: 0, eventDays: new Set(), intensities: [], counts: 0, daily: { none: 0, once: 0, several: 0 }, first: null, last: null });
    return groups.get(k);
  };
  const recordedDays = new Set();
  for (const e of entries) {
    const d = dayOfInstant(e.occurredAt);
    if (!inRange(d)) continue;
    const g = group(e);
    g.events += 1;
    g.counts += e.count ?? 1;
    g.eventDays.add(d);
    if (e.intensity) g.intensities.push(e.intensity);
    g.first = !g.first || e.occurredAt < g.first ? e.occurredAt : g.first;
    g.last = !g.last || e.occurredAt > g.last ? e.occurredAt : g.last;
    recordedDays.add(d);
  }
  for (const r of ratings) {
    if (!inRange(r.date)) continue;
    group(r).daily[r.frequency] += 1;
    recordedDays.add(r.date);
  }
  const symptoms = [...groups.values()]
    .map((g) => ({
      ...g,
      eventDays: g.eventDays.size,
      maxIntensity: g.intensities.length ? Math.max(...g.intensities) : null,
      intensityRecords: g.intensities.length,
    }))
    .sort((a, b) => b.events - a.events || b.daily.several - a.daily.several);
  return { from, to, totalDays, recordedDays: recordedDays.size, missingDays: totalDays - recordedDays.size, symptoms };
}

// Per-day series for a chart: null marks a day with no record at all.
export function dailySeries(entries, ratings, from, to, key) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const events = entries.filter((e) => symptomKey(e) === key && dayOfInstant(e.occurredAt) === d).length;
    const rating = ratings.find((r) => r.date === d && symptomKey(r) === key);
    const value = events ? events : rating ? { none: 0, once: 1, several: 2 }[rating.frequency] : null;
    out.push({ date: d, value, events, rating: rating?.frequency ?? null });
  }
  return out;
}

// Compare two equal-length periods; always returns the record volume so the UI
// can say "based on N records" and refuse to compare when data is thin.
export function comparePeriods(entries, ratings, key, a, b, minRecordedDays = 4) {
  const one = (p) => {
    const s = symptomSummary(entries, ratings, p.from, p.to);
    const g = s.symptoms.find((x) => x.key === key);
    return { ...p, recordedDays: s.recordedDays, totalDays: s.totalDays, events: g?.events ?? 0, eventDays: g?.eventDays ?? 0 };
  };
  const first = one(a), second = one(b);
  return { first, second, enoughData: first.recordedDays >= minRecordedDays && second.recordedDays >= minRecordedDays };
}

export function upcomingVisits(state, today, filter) {
  const obs = byId(selectedObservations(state, filter));
  return state.visits
    .filter((v) => v.status === "planned" && obs.has(v.observationId) && v.date >= today)
    .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
}

// Most useful next actions for the home screen (no medical judgement).
export function nextActions(state, now, filter) {
  const today = localDay(now);
  const observations = selectedObservations(state, filter);
  const obsIds = new Set(observations.map((o) => o.id));
  const actions = [];
  const due = plannedDoses(state, today, today).filter(
    (d) => obsIds.has(state.courses.find((c) => c.id === d.courseId).observationId) && (d.status === "pending" || d.status === "snoozed") && Date.parse(d.at) <= now.getTime() + 3600000,
  );
  if (due.length) actions.push({ type: "confirmDose", count: due.length });
  for (const o of observations) {
    const visits = state.visits.filter((v) => v.observationId === o.id);
    const past = visits.filter((v) => v.status === "planned" && v.date < today);
    if (past.length) actions.push({ type: "recordOutcome", observationId: o.id, visitId: past[0].id });
    const soon = visits.find((v) => v.status === "planned" && v.date >= today && daysBetween(today, v.date) <= 3);
    if (soon) actions.push({ type: "prepareReport", observationId: o.id, visitId: soon.id });
    if (o.stage === "visited" && !state.prescriptions.some((p) => visits.some((v) => v.id === p.visitId)))
      actions.push({ type: "reviewPrescriptions", observationId: o.id });
    if (o.stage === "followup" && !state.assessments.some((a) => a.observationId === o.id && a.date === today))
      actions.push({ type: "assessResult", observationId: o.id });
  }
  if (observations.length && !state.entries.some((e) => dayOfInstant(e.occurredAt) === today) && !state.dailyRatings.some((r) => r.date === today))
    actions.push({ type: "addObservation" });
  return actions;
}

export function visitChain(state, visitId) {
  const visits = byId(state.visits);
  const chain = [];
  for (let v = visits.get(visitId); v && chain.length < 50; v = visits.get(v.previousVisitId)) chain.unshift(v);
  return chain;
}
