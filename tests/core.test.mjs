import { test } from "node:test";
import assert from "node:assert/strict";
import { builder, twoDoctors, fixture, ids } from "./helpers.mjs";
import { migrateV1, upgrade } from "../core/migrate.js";
import { validateState } from "../core/validate.js";
import { emptyState } from "../core/schema.js";
import { plannedDoses, dueReminders, nextWake } from "../core/schedule.js";
import { selectedObservations, recordsFor, symptomSummary, comparePeriods, nextActions, searchEntries, dailySeries } from "../core/views.js";
import { deletionImpact } from "../core/commands.js";

test("first launch is empty: no demo doctors, visits or health records", () => {
  const s = validateState(emptyState());
  for (const k of ["doctors", "observations", "visits", "entries", "dailyRatings", "courses", "doseEvents"])
    assert.deepEqual(s[k], []);
});

test("v0.4.0 migration keeps language, IDs, timestamps, notes and links", () => {
  const v1 = JSON.parse(fixture("v0.4.0-records.json"));
  const { state, report } = migrateV1(v1, { now: new Date("2026-10-03T10:00:00Z"), newId: ids("m") });
  assert.equal(state.settings.language, "pl");
  assert.equal(state.doctors.length, 1);
  assert.equal(state.doctors[0].specialty, "cardiologist");
  const o = state.observations[0];
  assert.equal(o.id, v1.visit.id);
  assert.equal(o.reason, v1.visit.reason);
  assert.equal(state.visits[0].date, "2026-11-19");
  assert.equal(state.visits[0].observationId, o.id);
  assert.equal(state.entries.length, 2);
  const e = state.entries.find((x) => x.id === v1.events[0].id);
  assert.equal(e.occurredAt, v1.events[0].timestamp);
  assert.equal(e.note, "TEST — zażółć gęślą jaźń");
  assert.deepEqual(e.observationIds, [o.id]);
  assert.equal(state.dailyRatings[0].frequency, "several");
  assert.deepEqual(report, { from: 1, to: 2, doctors: 1, observations: 1, visits: 1, entries: 2, dailyRatings: 1 });
});

test("v0.4.0 file without a visit migrates to an empty v2 state", () => {
  const { state } = upgrade({ version: 1, language: "en", visit: null, events: [], answers: [] }, { newId: ids() });
  assert.equal(state.observations.length, 0);
});

test("unknown, newer and malformed v1 files are refused, not guessed", () => {
  assert.throws(() => upgrade({ schemaVersion: 99 }, { newId: ids() }), (e) => e.code === "NEWER_SCHEMA");
  assert.throws(() => upgrade({ hello: 1 }, { newId: ids() }), (e) => e.code === "UNKNOWN_FORMAT");
  const bad = JSON.parse(fixture("v0.4.0-records.json"));
  bad.events[0].visitID = "other";
  assert.throws(() => upgrade(bad, { newId: ids() }), (e) => e.code === "V1_EVENT");
});

test("several doctors and observations; filters select them independently", () => {
  const b = builder();
  const { cardio, neuro, o1, o2 } = twoDoctors(b);
  assert.equal(selectedObservations(b.state, {}).length, 2);
  assert.deepEqual(selectedObservations(b.state, { doctorIds: [neuro] }).map((o) => o.id), [o2]);
  assert.equal(selectedObservations(b.state, { doctorIds: [cardio, neuro] }).length, 2);
  b.run("doctor.archive", { id: neuro, archived: true });
  assert.deepEqual(selectedObservations(b.state, {}).map((o) => o.id), [o1]);
  assert.equal(selectedObservations(b.state, { archived: true }).length, 2, "archived history kept");
});

test("one entry linked to two observations is stored and counted once", () => {
  const b = builder();
  const { o1, o2 } = twoDoctors(b);
  b.run("entry.save", { symptom: "dizziness", occurredAt: "2026-10-02T08:00:00Z", note: "TEST", observationIds: [o1, o2, o1] });
  b.run("entry.save", { symptom: "custom", customLabel: "TEST tingling", occurredAt: "2026-10-02T09:00:00Z", observationIds: [] });
  assert.equal(b.state.entries.length, 2);
  assert.deepEqual(b.state.entries.find((e) => e.symptom === "dizziness").observationIds, [o1, o2]);
  const both = recordsFor(b.state.entries, [o1, o2]);
  assert.equal(both.length, 2, "linked entry once + general entry");
  assert.equal(recordsFor(b.state.entries, [o1], { includeGeneral: false }).length, 1);
  const s = symptomSummary(both, [], "2026-10-01", "2026-10-03");
  assert.equal(s.symptoms.find((x) => x.key === "dizziness").events, 1);
});

test("entry edits keep event and creation time and record modification time", () => {
  const b = builder();
  const { o1 } = twoDoctors(b);
  const id = b.run("entry.save", { symptom: "pain", occurredAt: "2026-10-01T07:00:00Z", observationIds: [o1] }, new Date("2026-10-01T07:05:00Z"));
  b.run("entry.save", { id, symptom: "headache", note: "TEST edit", intensity: 3, durationMinutes: 40, trigger: "TEST screen" }, new Date("2026-10-02T12:00:00Z"));
  const e = b.state.entries[0];
  assert.equal(e.occurredAt, "2026-10-01T07:00:00Z");
  assert.equal(e.createdAt, "2026-10-01T07:05:00.000Z");
  assert.equal(e.updatedAt, "2026-10-02T12:00:00.000Z");
  assert.equal(e.symptom, "headache");
  assert.deepEqual(e.observationIds, [], "links are replaced by the edit payload");
});

test("future events, unknown links and bad intensity are rejected", () => {
  const b = builder();
  twoDoctors(b);
  assert.throws(() => b.run("entry.save", { symptom: "pain", occurredAt: "2027-01-01T00:00:00Z" }));
  assert.throws(() => b.run("entry.save", { symptom: "pain", occurredAt: "2026-10-01T00:00:00Z", observationIds: ["nope"] }));
  assert.throws(() => b.run("entry.save", { symptom: "pain", occurredAt: "2026-10-01T00:00:00Z", intensity: 9 }));
  assert.throws(() => b.run("entry.save", { symptom: "custom", customLabel: " ", occurredAt: "2026-10-01T00:00:00Z" }));
});

test("daily rating is one per day and symptom; custom labels compare case-insensitively", () => {
  const b = builder();
  b.run("daily.save", { date: "2026-10-03", symptom: "fatigue", frequency: "none" });
  b.run("daily.save", { date: "2026-10-03", symptom: "fatigue", frequency: "several", note: "TEST" });
  b.run("daily.save", { date: "2026-10-03", symptom: "custom", customLabel: "Tingling", frequency: "once" });
  b.run("daily.save", { date: "2026-10-03", symptom: "custom", customLabel: "tingling", frequency: "several" });
  assert.equal(b.state.dailyRatings.length, 2);
});

test("stage changes keep history and records; stages are independent per observation", () => {
  const b = builder();
  const { o1, o2 } = twoDoctors(b);
  b.run("entry.save", { symptom: "pain", occurredAt: "2026-10-01T07:00:00Z", observationIds: [o1] });
  b.run("observation.stage", { id: o1, stage: "treatment" });
  b.run("observation.stage", { id: o1, stage: "visited" }); // correcting a mistake
  const o = b.state.observations.find((x) => x.id === o1);
  assert.equal(o.stage, "visited");
  assert.deepEqual(o.stageHistory.map((h) => h.stage), ["waiting", "treatment", "visited"]);
  assert.equal(b.state.observations.find((x) => x.id === o2).stage, "waiting");
  assert.equal(b.state.entries.length, 1);
});

test("visit outcome, prescriptions with source, and linked follow-up visit", () => {
  const b = builder();
  const { o1 } = twoDoctors(b);
  const v1 = b.state.visits.find((v) => v.observationId === o1).id;
  b.run("visit.outcome", { id: v1, notes: "TEST notes", recommendations: "TEST rec", followUpDate: "2027-01-10", returnAdvice: "TEST return if worse", source: "user" });
  const p = b.run("prescription.save", { visitId: v1, kind: "test", text: "TEST ECG", dueDate: "2026-12-01", source: "document" });
  const v2 = b.run("visit.save", { observationId: o1, date: "2027-01-10", previousVisitId: v1 });
  const visit2 = b.state.visits.find((v) => v.id === v2);
  assert.equal(visit2.kind, "followup");
  assert.equal(visit2.previousVisitId, v1);
  assert.equal(b.state.visits.find((v) => v.id === v1).status, "done");
  assert.equal(b.state.observations.find((o) => o.id === o1).stage, "visited", "waiting → visited after results");
  assert.equal(b.state.prescriptions.find((x) => x.id === p).source, "document");
});

test("deleting a doctor explains consequences and never deletes symptom entries", () => {
  const b = builder();
  const { cardio, o1, o2 } = twoDoctors(b);
  b.run("entry.save", { symptom: "pain", occurredAt: "2026-10-01T07:00:00Z", observationIds: [o1] });
  b.run("entry.save", { symptom: "pain", occurredAt: "2026-10-01T08:00:00Z", observationIds: [o1, o2] });
  b.run("course.save", { observationId: o1, name: "TEST med", dose: "1 tab", startDate: "2026-10-01", indefinite: true, times: ["08:00"], days: [1, 2, 3, 4, 5, 6, 7] });
  const impact = deletionImpact(b.state, "doctor", cardio);
  assert.equal(impact.observations, 1);
  assert.equal(impact.courses, 1);
  assert.equal(impact.entriesUnlinked, 2);
  assert.equal(impact.entriesBecomeGeneral, 1);
  b.run("doctor.delete", { id: cardio });
  assert.equal(b.state.entries.length, 2);
  assert.deepEqual(b.state.entries.map((e) => e.observationIds).sort(), [[], [o2]]);
  assert.equal(b.state.courses.length, 0);
});

function course(b, obs, extra = {}) {
  return b.run("course.save", { observationId: obs, name: "TEST med", dose: "5 mg", instructions: "TEST after food", startDate: "2026-10-01", endDate: "2026-10-10", indefinite: false, times: ["20:00", "08:00"], days: [1, 2, 3, 4, 5, 6, 7], ...extra });
}

test("course schedule: planned doses within dates and weekdays, no dose inferred from the name", () => {
  const b = builder();
  const { o1 } = twoDoctors(b);
  const c = course(b, o1, { days: [1, 3, 5] }); // Mon, Wed, Fri
  const doses = plannedDoses(b.state, "2026-09-28", "2026-10-12");
  assert.ok(doses.every((d) => d.date >= "2026-10-01" && d.date <= "2026-10-10"));
  assert.deepEqual([...new Set(doses.map((d) => d.date))], ["2026-10-02", "2026-10-05", "2026-10-07", "2026-10-09"]);
  assert.equal(doses.length, 8);
  assert.deepEqual(b.state.courses.find((x) => x.id === c).times, ["08:00", "20:00"]);
  assert.throws(() => course(b, o1, { endDate: "2026-09-01" }), /INVALID_DATA/);
  assert.throws(() => course(b, o1, { indefinite: false, endDate: null }));
});

test("marking a dose twice updates one record; planned and actual time are kept", () => {
  const b = builder(new Date("2026-10-03T19:00:00Z"));
  const { o1 } = twoDoctors(b);
  const c = course(b, o1);
  b.run("dose.mark", { courseId: c, date: "2026-10-03", time: "08:00", status: "taken", actualAt: "2026-10-03T07:30:00Z" });
  b.run("dose.mark", { courseId: c, date: "2026-10-03", time: "08:00", status: "taken", actualAt: "2026-10-03T07:35:00Z" });
  assert.equal(b.state.doseEvents.length, 1);
  const e = b.state.doseEvents[0];
  assert.equal(e.scheduledTime, "08:00");
  assert.equal(e.actualAt, "2026-10-03T07:35:00Z");
  b.run("dose.mark", { courseId: c, date: "2026-10-03", time: "08:00", status: "skipped" });
  assert.equal(b.state.doseEvents[0].actualAt, null);
  assert.throws(() => b.run("dose.mark", { courseId: c, date: "2026-10-03", time: "09:00", status: "taken" }), "time not in course");
  b.run("dose.clear", { id: e.id });
  assert.equal(plannedDoses(b.state, "2026-10-03", "2026-10-03")[0].status, "pending");
});

test("reminders: once per dose, none after taken, snooze re-notifies once, missed ones are not replayed late", () => {
  const b = builder(new Date(2026, 9, 3, 7, 0));
  const { o1 } = twoDoctors(b);
  const c = course(b, o1);
  const delivered = new Set();
  const at = (h, m) => new Date(2026, 9, 3, h, m);
  assert.equal(dueReminders(b.state, at(7, 59), delivered).length, 0);
  const due = dueReminders(b.state, at(8, 1), delivered);
  assert.equal(due.length, 1);
  delivered.add(due[0].key);
  assert.equal(dueReminders(b.state, at(8, 2), delivered).length, 0, "no repeat");
  b.run("dose.mark", { courseId: c, date: "2026-10-03", time: "08:00", status: "snoozed", snoozeMinutes: 15 }, at(8, 3));
  assert.equal(dueReminders(b.state, at(8, 10), delivered).length, 0);
  const snoozed = dueReminders(b.state, at(8, 19), delivered);
  assert.equal(snoozed.length, 1);
  delivered.add(snoozed[0].key);
  assert.equal(dueReminders(b.state, at(8, 20), delivered).length, 0);
  // Computer asleep from 19:00 to 21:00: the 20:00 reminder is not replayed at 21:00.
  assert.equal(dueReminders(b.state, at(21, 0), delivered).length, 0);
  b.run("dose.mark", { courseId: c, date: "2026-10-03", time: "20:00", status: "taken" }, at(21, 0));
  assert.equal(nextWake(b.state, at(21, 1)), new Date(2026, 9, 4, 8, 0).getTime());
  b.run("settings.update", { notificationsEnabled: false });
  assert.equal(dueReminders(b.state, at(8, 1), new Set()).length, 0);
  assert.equal(nextWake(b.state, at(7, 0)), null);
});

test("changing a course drops reminders for removed times (no stale notifications)", () => {
  const b = builder(new Date(2026, 9, 3, 7, 0));
  const { o1 } = twoDoctors(b);
  const c = course(b, o1);
  b.run("course.save", { id: c, observationId: o1, name: "TEST med", dose: "5 mg", startDate: "2026-10-01", endDate: "2026-10-10", indefinite: false, times: ["09:00"], days: [1, 2, 3, 4, 5, 6, 7] });
  assert.equal(dueReminders(b.state, new Date(2026, 9, 3, 8, 5), new Set()).length, 0);
  assert.equal(dueReminders(b.state, new Date(2026, 9, 3, 9, 5), new Set()).length, 1);
  b.run("course.stop", { id: c, stopped: true }, new Date(2026, 9, 3, 10, 0));
  assert.equal(plannedDoses(b.state, "2026-10-04", "2026-10-05").length, 0);
});

test("views: search, gaps reported as missing data, comparisons state volume", () => {
  const b = builder();
  const { o1 } = twoDoctors(b);
  b.run("entry.save", { symptom: "headache", occurredAt: "2026-10-01T10:00:00Z", note: "TEST coffee", observationIds: [o1] });
  b.run("entry.save", { symptom: "headache", occurredAt: "2026-09-20T10:00:00Z", trigger: "TEST stairs" });
  assert.equal(searchEntries(b.state.entries, { query: "coffee" }).length, 1);
  assert.equal(searchEntries(b.state.entries, { symptom: "headache", from: "2026-09-25" }).length, 1);
  const series = dailySeries(b.state.entries, [], "2026-09-30", "2026-10-02", "headache");
  assert.deepEqual(series.map((d) => d.value), [null, 1, null]);
  const s = symptomSummary(b.state.entries, [], "2026-09-28", "2026-10-03");
  assert.equal(s.recordedDays, 1);
  assert.equal(s.missingDays, 5);
  const cmp = comparePeriods(b.state.entries, [], "headache", { from: "2026-09-18", to: "2026-09-24" }, { from: "2026-09-25", to: "2026-10-01" });
  assert.equal(cmp.enoughData, false);
});

test("next actions point to outcomes, doses and reports without medical judgement", () => {
  const b = builder(new Date(2026, 9, 18, 9, 0));
  const { o1, o2 } = twoDoctors(b);
  const c = course(b, o1, { endDate: "2026-10-30" });
  const types = nextActions(b.state, new Date(2026, 9, 18, 9, 0), {}).map((a) => a.type);
  assert.ok(types.includes("confirmDose"));
  assert.ok(types.includes("prepareReport"), "visit on 20 Oct is within 3 days");
  assert.ok(types.includes("addObservation"));
  const later = nextActions(b.state, new Date(2026, 9, 21, 9, 0), { doctorIds: [b.state.observations.find((o) => o.id === o2).doctorId] }).map((a) => a.type);
  assert.deepEqual(later.filter((t) => t === "recordOutcome").length, 1);
  assert.ok(!later.includes("confirmDose"), "filter hides other doctor's course");
  void c;
});
