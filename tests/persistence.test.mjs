import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Persistence, mergeStates } from "../src/persistence.mjs";
import { tempDir, fixture, ids } from "./helpers.mjs";

const open = (dir, extra = {}) => new Persistence(dir, { newId: ids(), appVersion: "test", ...extra });
const seed = (p) => {
  const d = p.apply("doctor.save", { specialty: "cardiologist", name: "TEST" });
  const o = p.apply("observation.save", { doctorId: d, reason: "TEST reason", visitDate: "2026-11-19" });
  p.apply("entry.save", { symptom: "pain", occurredAt: "2026-10-01T07:00:00Z", note: "TEST ąę", observationIds: [o] });
  return { d, o };
};

test("empty start, persistence and language survive reopening", (t) => {
  const dir = tempDir(t);
  const p = open(dir);
  assert.equal(p.read().doctors.length, 0);
  seed(p);
  p.apply("settings.update", { language: "pl" });
  const again = open(dir);
  assert.equal(again.read().settings.language, "pl");
  assert.equal(again.read().entries[0].note, "TEST ąę");
});

test("v0.4.0 file: exact pre-migration backup, migrated data committed, idempotent on reopen", (t) => {
  const dir = tempDir(t);
  const original = fixture("v0.4.0-records.json");
  fs.writeFileSync(path.join(dir, "records.json"), original);
  const p = open(dir);
  assert.equal(p.problem, null);
  assert.equal(p.migration.entries, 2);
  const backups = fs.readdirSync(path.join(dir, "backups"));
  assert.equal(backups.length, 1);
  assert.match(backups[0], /pre-migration-v1/);
  assert.deepEqual(fs.readFileSync(path.join(dir, "backups", backups[0])), original);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "records.json"))).schemaVersion, 2);
  const again = open(dir);
  assert.equal(again.migration, null);
  assert.equal(fs.readdirSync(path.join(dir, "backups")).length, 1);
  assert.deepEqual(again.read(), p.read());
});

test("damaged and newer files are preserved untouched and reported", (t) => {
  const dir = tempDir(t);
  for (const [raw, code] of [["{broken", "NOT_JSON"], ['{"schemaVersion":7}', "NEWER_SCHEMA"], ['{"schemaVersion":2}', "SETTINGS"]]) {
    fs.writeFileSync(path.join(dir, "records.json"), raw);
    const p = open(dir);
    assert.equal(p.state, null);
    assert.equal(p.problem.code, code);
    assert.throws(() => p.apply("settings.update", { language: "pl" }));
    assert.equal(fs.readFileSync(path.join(dir, "records.json"), "utf8"), raw);
  }
});

test("recovery: start empty keeps the damaged file; restore from an automatic backup", (t) => {
  const dir = tempDir(t);
  const p = open(dir);
  seed(p);
  p.backupCurrent("manual");
  fs.writeFileSync(path.join(dir, "records.json"), "{broken");
  const broken = open(dir);
  assert.equal(broken.problem.code, "NOT_JSON");
  const [backup] = broken.listBackups();
  broken.restoreBackup(backup.name);
  assert.equal(broken.read().entries.length, 1);
  assert.ok(fs.readdirSync(dir).some((n) => n.startsWith("records.unreadable-")), "damaged file kept");
  fs.writeFileSync(path.join(dir, "records.json"), "{broken again");
  const again = open(dir);
  const kept = again.startEmptyKeepingDamaged();
  assert.ok(fs.existsSync(path.join(dir, kept)));
  assert.equal(again.read().entries.length, 0);
});

test("failed and invalid writes keep the committed file and memory state", (t) => {
  const dir = tempDir(t);
  const p = open(dir);
  seed(p);
  const before = fs.readFileSync(p.file, "utf8");
  assert.throws(() => p.apply("entry.save", { symptom: "pain", occurredAt: "nope" }));
  assert.throws(() => p.apply("doctor.save", { specialty: "fake" }));
  p.file = path.join(dir, "missing-dir", "records.json");
  const memory = p.read();
  assert.throws(() => p.apply("settings.update", { language: "pl" }));
  assert.deepEqual(p.read(), memory);
  assert.equal(fs.readFileSync(path.join(dir, "records.json"), "utf8"), before);
  assert.ok(!fs.readdirSync(dir).some((n) => n.endsWith(".tmp")));
});

test("attachments are stored, exported with the backup, verified and restored on import", (t) => {
  const a = open(tempDir(t));
  const { o } = seed(a);
  const visit = a.read().visits.find((v) => v.observationId === o).id;
  const bytes = Buffer.from("%PDF-1.4 TEST");
  const attId = a.storeAttachment(visit, "TEST result.pdf", "application/pdf", bytes);
  assert.ok(fs.existsSync(a.attachmentPath(a.read().attachments[0])));
  const backup = JSON.parse(JSON.stringify(a.exportBackup()));
  assert.equal(backup.format, "symptopage-backup");
  assert.equal(backup.formatVersion, 1);

  const bDir = tempDir(t);
  const b = open(bDir);
  const report = b.importBackup(backup, "merge");
  assert.equal(report.added > 0, true);
  assert.equal(report.missingAttachmentFiles, 0);
  assert.deepEqual(fs.readFileSync(b.attachmentPath(b.read().attachments[0])), bytes);
  // Repeated import is a no-op: nothing added, nothing duplicated.
  const second = b.importBackup(backup, "merge");
  assert.equal(second.added, 0);
  assert.equal(b.read().entries.length, 1);
  assert.ok(b.listBackups().some((x) => x.name.includes("pre-import")));
  // Tampered attachment bytes are refused.
  const bad = structuredClone(backup);
  bad.attachments[0].data = Buffer.from("other").toString("base64");
  assert.throws(() => open(tempDir(t)).importBackup(bad), (e) => e.code === "ATTACHMENT_HASH");
  // Deleting the visit's attachment removes its file.
  a.apply("attachment.delete", { id: attId });
  assert.equal(fs.readdirSync(path.join(a.dir, "attachments")).length, 0);
});

test("merge: newer edits win, older ones are kept local, daily ratings dedupe by day and symptom", () => {
  const base = { schemaVersion: 2, settings: { language: "en", notificationsEnabled: true, notificationDetails: false, country: null }, doctors: [], observations: [], visits: [], prescriptions: [], courses: [], doseEvents: [], entries: [], dailyRatings: [], assessments: [], attachments: [] };
  const entry = (note, updatedAt) => ({ id: "e1", symptom: "pain", customLabel: "", occurredAt: "2026-10-01T07:00:00Z", createdAt: "2026-10-01T07:00:00Z", updatedAt, note, durationMinutes: null, intensity: null, count: null, trigger: "", observationIds: [] });
  const rating = (id, frequency, updatedAt) => ({ id, date: "2026-10-01", symptom: "pain", customLabel: "", frequency, note: "", observationIds: [], createdAt: updatedAt, updatedAt });
  const local = { ...base, entries: [entry("local", "2026-10-02T00:00:00Z")], dailyRatings: [rating("r-local", "none", "2026-10-01T10:00:00Z")] };
  const incoming = { ...base, entries: [entry("phone", "2026-10-03T00:00:00Z")], dailyRatings: [rating("r-phone", "several", "2026-10-01T09:00:00Z")] };
  const { state, report } = mergeStates(local, incoming);
  assert.equal(state.entries[0].note, "phone");
  assert.equal(state.dailyRatings.length, 1);
  assert.equal(state.dailyRatings[0].frequency, "none");
  assert.deepEqual(report, { added: 0, unchanged: 0, updatedFromImport: 1, keptLocal: 1 });
});

test("replace import also accepts a bare v0.4.0 records file and backs up first", (t) => {
  const dir = tempDir(t);
  const p = open(dir);
  seed(p);
  p.importBackup(JSON.parse(fixture("v0.4.0-records.json")), "replace");
  assert.equal(p.read().settings.language, "pl");
  assert.equal(p.read().entries.length, 2);
  assert.ok(p.listBackups().some((b) => b.name.includes("pre-import-replace")));
});

test("data files never contain fields outside the documented model", (t) => {
  const p = open(tempDir(t));
  seed(p);
  const saved = JSON.parse(fs.readFileSync(p.file));
  assert.deepEqual(Object.keys(saved).sort(), ["assessments", "attachments", "courses", "dailyRatings", "doctors", "doseEvents", "entries", "observations", "prescriptions", "schemaVersion", "settings", "visits"]);
});
