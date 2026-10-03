// Writes tests/fixtures/windows-backup.json: a real export from src/persistence.mjs
// built on the synthetic v2 sample, so the iOS client can test Windows → iOS import.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Persistence } from "../src/persistence.mjs";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "symptopage-fixture-"));
fs.copyFileSync(new URL("../tests/fixtures/v2-sample.json", import.meta.url), path.join(dir, "records.json"));
const p = new Persistence(dir, { appVersion: "0.5.0", clock: () => new Date("2026-10-03T12:00:00Z") });
fs.writeFileSync(new URL("../tests/fixtures/windows-backup.json", import.meta.url), JSON.stringify(p.exportBackup(), null, 2) + "\n");
fs.rmSync(dir, { recursive: true, force: true });
console.log("windows-backup.json written");
