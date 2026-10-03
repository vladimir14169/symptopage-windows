import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Reminders } from "../src/reminders.mjs";
import { builder, twoDoctors, tempDir } from "./helpers.mjs";

function setup(t, details = false) {
  const b = builder(new Date(2026, 9, 3, 7, 0));
  const { o1 } = twoDoctors(b);
  b.run("course.save", { observationId: o1, name: "TEST Secretmed", dose: "5 mg", startDate: "2026-10-01", indefinite: true, times: ["08:00"], days: [1, 2, 3, 4, 5, 6, 7] });
  if (details) b.run("settings.update", { notificationDetails: true });
  return { b, dir: tempDir(t) };
}

test("default reminder text hides medication details (lock-screen privacy)", (t) => {
  const { b, dir } = setup(t);
  const shown = [];
  const r = new Reminders(dir, { state: b.state }, (n) => shown.push(n), () => new Date(2026, 9, 3, 8, 1));
  r.check();
  assert.equal(shown.length, 1);
  assert.doesNotMatch(shown[0].title + shown[0].body, /Secretmed|5 mg/);
  const saved = fs.readFileSync(path.join(dir, "reminders-state.json"), "utf8");
  assert.doesNotMatch(saved, /Secretmed/, "state file holds keys only");
});

test("details appear only when enabled", (t) => {
  const { b, dir } = setup(t, true);
  const shown = [];
  new Reminders(dir, { state: b.state }, (n) => shown.push(n), () => new Date(2026, 9, 3, 8, 1)).check();
  assert.match(shown[0].body, /TEST Secretmed — 5 mg/);
});

test("restart does not repeat a delivered reminder", (t) => {
  const { b, dir } = setup(t);
  const shown = [];
  const clock = () => new Date(2026, 9, 3, 8, 2);
  new Reminders(dir, { state: b.state }, (n) => shown.push(n), clock).check();
  new Reminders(dir, { state: b.state }, (n) => shown.push(n), clock).check();
  assert.equal(shown.length, 1);
});

test("no reminders while data is unreadable or reminders are off", (t) => {
  const { b, dir } = setup(t);
  const shown = [];
  new Reminders(dir, { state: null }, (n) => shown.push(n), () => new Date(2026, 9, 3, 8, 1)).check();
  b.run("settings.update", { notificationsEnabled: false });
  new Reminders(dir, { state: b.state }, (n) => shown.push(n), () => new Date(2026, 9, 3, 8, 1)).check();
  assert.equal(shown.length, 0);
});
