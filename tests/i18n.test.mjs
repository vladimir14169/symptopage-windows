// Every user text exists in English and Polish, and every key used by the UI exists.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { messages, translate } from "../core/i18n.js";
import { SPECIALTIES, SYMPTOMS, STAGES, FREQUENCIES, INTENSITIES, VISIT_KINDS, VISIT_STATUSES, PRESCRIPTION_KINDS, SOURCES, RATINGS, COUNTRIES } from "../core/schema.js";
import { HELP_CONTACTS } from "../core/help.js";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : d.name.endsWith(".js") ? [path.join(dir, d.name)] : []));

test("each message has non-empty English and Polish text with the same placeholders", () => {
  for (const [key, entry] of Object.entries(messages)) {
    assert.equal(entry.length, 2, key);
    const forms = (v) => (typeof v === "string" ? [v] : Object.values(v));
    for (const v of entry) for (const f of forms(v)) assert.ok(f.trim(), key);
    const vars = (v) => [...new Set(forms(v).join(" ").match(/\{\w+\}/g) ?? [])].sort().join();
    assert.equal(vars(entry[0]), vars(entry[1]), `placeholders differ: ${key}`);
    if (typeof entry[1] === "object") for (const c of ["one", "few", "many"]) assert.ok(entry[1][c], `${key} missing Polish plural ${c}`);
  }
});

test("all static and enumerated keys used by the UI exist", () => {
  const used = new Set();
  for (const f of [...files(path.join(root, "ui/js")), ...files(path.join(root, "core"))])
    for (const m of fs.readFileSync(f, "utf8").matchAll(/\bt\("([\w.]+)"[,)]/g)) used.add(m[1]);
  for (const k of ["welcome.f1", "welcome.f2", "welcome.f3"]) used.add(k);
  // iOS SwiftUI code uses the same keys via model.t("…") / translator.t("…").
  const swift = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? swift(path.join(dir, d.name)) : d.name.endsWith(".swift") ? [path.join(dir, d.name)] : []));
  for (const f of swift(path.join(root, "ios/SymptoPage")))
    for (const m of fs.readFileSync(f, "utf8").matchAll(/\bt\("([\w.]+)"[,)]/g)) used.add(m[1]);
  const enumKeys = [
    ...SPECIALTIES.map((k) => "specialty." + k), ...SYMPTOMS.map((k) => "symptom." + k), ...STAGES.map((k) => "stage." + k),
    ...FREQUENCIES.map((k) => "frequency." + k), ...INTENSITIES.map((k) => "intensity." + k), ...VISIT_KINDS.map((k) => "visit.kind." + k),
    ...VISIT_STATUSES.map((k) => "visit.status." + k), ...PRESCRIPTION_KINDS.map((k) => "prescription.kind." + k), ...SOURCES.map((k) => "source." + k),
    ...RATINGS.map((k) => "rating." + k), ...COUNTRIES.map((k) => "country." + k),
    ...Object.values(HELP_CONTACTS).flat().map((c) => "contact." + c.kind),
    ...["home", "journal", "doctors", "visit", "medications", "progress", "report", "help", "settings"].flatMap((p) => (p === "visit" ? ["page.visit"] : ["page." + p, "nav." + p])),
    ...["pending", "taken", "skipped", "snoozed"].map((k) => "dose.status." + k),
    ...["symptoms", "daily", "medications", "outcomes", "questions", "assessments", "chronology"].map((k) => "report.section." + k),
    ...["observations", "visits", "prescriptions", "attachments", "courses", "doseEvents", "assessments"].map((k) => "delete." + k),
  ];
  const missing = [...used, ...enumKeys].filter((k) => !(k in messages));
  assert.deepEqual(missing, []);
});

test("Polish plurals and characters render correctly", () => {
  assert.equal(translate("pl", "journal.count", { n: 1 }), "1 zdarzenie");
  assert.equal(translate("pl", "journal.count", { n: 3 }), "3 zdarzenia");
  assert.equal(translate("pl", "journal.count", { n: 5 }), "5 zdarzeń");
  assert.equal(translate("pl", "journal.count", { n: 22 }), "22 zdarzenia");
  assert.equal(translate("en", "journal.count", { n: 1 }), "1 event");
  assert.match(translate("pl", "symptom.palpitations"), /ł/);
});
