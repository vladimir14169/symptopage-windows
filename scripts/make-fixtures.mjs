// Generates tests/fixtures/v2-sample.json: a deterministic, synthetic (TEST) v2
// state that both the Electron and the iOS core must read, validate and keep.
import fs from "node:fs";
import { builder } from "../tests/helpers.mjs";
const b = builder(new Date("2026-10-03T10:00:00Z"));
const d1 = b.run("doctor.save", { specialty: "cardiologist", name: "TEST Dr A", clinic: "TEST Clinic", note: "" });
const d2 = b.run("doctor.save", { specialty: "other", specialtyCustom: "TEST Allergist" });
const o1 = b.run("observation.save", { doctorId: d1, reason: "TEST kołatanie serca", questions: "TEST question?", visitDate: "2026-11-19", visitTime: "09:30" });
const o2 = b.run("observation.save", { doctorId: d2, reason: "TEST rash", visitDate: "2026-10-20" });
const v1 = b.state.visits.find((v) => v.observationId === o1).id;
b.run("visit.outcome", { id: v1, notes: "TEST notes", recommendations: "TEST rec", followUpDate: "2027-01-10", returnAdvice: "TEST return", source: "document" });
const p = b.run("prescription.save", { visitId: v1, kind: "medication", text: "TEST Med 5 mg", source: "document" });
const c = b.run("course.save", { observationId: o1, prescriptionId: p, name: "TEST Med", dose: "5 mg", instructions: "TEST", startDate: "2026-10-01", endDate: "2026-10-31", indefinite: false, times: ["08:00", "20:00"], days: [1, 2, 3, 4, 5, 6, 7] });
b.run("dose.mark", { courseId: c, date: "2026-10-02", time: "08:00", status: "taken", actualAt: "2026-10-02T06:10:00.000Z" });
b.run("dose.mark", { courseId: c, date: "2026-10-02", time: "20:00", status: "skipped" });
b.run("entry.save", { symptom: "dizziness", occurredAt: "2026-10-02T07:00:00.000Z", note: "TEST zażółć", intensity: 2, durationMinutes: 15, count: 2, trigger: "TEST stairs", observationIds: [o1, o2] });
b.run("entry.save", { symptom: "custom", customLabel: "TEST tingling", occurredAt: "2026-10-01T07:00:00.000Z" });
b.run("daily.save", { date: "2026-10-02", symptom: "palpitations", frequency: "several", observationIds: [o1] });
b.run("assessment.save", { observationId: o1, date: "2026-10-02", rating: "better" });
b.run("settings.update", { language: "pl", country: "PL" });
fs.writeFileSync(new URL("../tests/fixtures/v2-sample.json", import.meta.url), JSON.stringify(b.state, null, 2) + "\n");
console.log("v2-sample.json written");
