// Scheduling under different time zones and DST transitions. Each case runs in
// a child process because the TZ of a running Node process cannot be changed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const probe = `
import { builder, twoDoctors } from "./tests/helpers.mjs";
import { plannedDoses, dueReminders } from "./core/schedule.js";
const b = builder(new Date("2026-10-01T00:00:00Z"));
const { o1 } = twoDoctors(b);
b.run("course.save", { observationId: o1, name: "TEST", dose: "1", startDate: "2026-10-24", indefinite: true, times: ["02:30", "08:00"], days: [1,2,3,4,5,6,7] });
const doses = plannedDoses(b.state, process.argv[1], process.argv[2]).map(d => ({ date: d.date, time: d.time, local: new Date(d.at).toString().slice(16, 21), at: d.at }));
const due = dueReminders(b.state, new Date(process.argv[3]), new Set()).map(r => r.dose.time);
console.log(JSON.stringify({ doses, due }));
`;
function run(tz, from, to, now) {
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", probe, from, to, now], {
    env: { ...process.env, TZ: tz },
    cwd: new URL("..", import.meta.url),
  });
  return JSON.parse(out.toString());
}

test("Europe/Warsaw autumn DST change: 08:00 stays 08:00 local; one dose per planned time", () => {
  const r = run("Europe/Warsaw", "2026-10-24", "2026-10-26", "2026-10-25T07:05:00Z");
  assert.equal(r.doses.length, 6);
  assert.deepEqual(r.doses.filter((d) => d.time === "08:00").map((d) => d.local), ["08:00", "08:00", "08:00"]);
  // 25 Oct: 08:00 CET = 07:00Z
  assert.equal(r.doses.find((d) => d.date === "2026-10-25" && d.time === "08:00").at, "2026-10-25T07:00:00.000Z");
  assert.deepEqual(r.due, ["08:00"]);
});

test("Europe/Warsaw spring DST gap: 02:30 does not exist and is moved forward, not dropped", () => {
  const r = run("Europe/Warsaw", "2027-03-28", "2027-03-28", "2027-03-28T01:35:00Z");
  const gap = r.doses.find((d) => d.time === "02:30");
  assert.equal(gap.local, "03:30");
  assert.equal(r.doses.length, 2);
});

test("time-zone change: the same course follows the new local wall clock", () => {
  const warsaw = run("Europe/Warsaw", "2026-11-02", "2026-11-02", "2026-11-02T07:01:00Z");
  const ny = run("America/New_York", "2026-11-02", "2026-11-02", "2026-11-02T13:01:00Z");
  assert.equal(warsaw.doses.find((d) => d.time === "08:00").at, "2026-11-02T07:00:00.000Z");
  assert.equal(ny.doses.find((d) => d.time === "08:00").at, "2026-11-02T13:00:00.000Z");
  assert.deepEqual(ny.due, ["08:00"]);
});
