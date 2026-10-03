// Test helpers. All data here is synthetic and marked TEST.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emptyState } from "../core/schema.js";
import { apply } from "../core/commands.js";

export function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "symptopage-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function ids(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

// A small in-memory builder around apply() with a controllable clock.
export function builder(now = new Date("2026-10-03T10:00:00Z")) {
  const ctx = { now, newId: ids() };
  let state = emptyState();
  const run = (command, payload, at) => {
    const r = apply(state, command, payload, { ...ctx, now: at ?? ctx.now });
    state = r.state;
    return r.result;
  };
  return { run, get state() { return state; }, ctx };
}

export function twoDoctors(b) {
  const cardio = b.run("doctor.save", { specialty: "cardiologist", name: "TEST Dr A", clinic: "", note: "" });
  const neuro = b.run("doctor.save", { specialty: "neurologist", name: "", clinic: "TEST clinic", note: "" });
  const o1 = b.run("observation.save", { doctorId: cardio, reason: "TEST palpitations", visitDate: "2026-11-19" });
  const o2 = b.run("observation.save", { doctorId: neuro, reason: "TEST headaches", visitDate: "2026-10-20" });
  return { cardio, neuro, o1, o2 };
}

export const fixture = (name) =>
  fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
