// Desktop medication reminders (main process).
// Limits (documented in WINDOWS_SETUP_RU.md): reminders are shown only while the
// app process runs (window open, or hidden to the tray when enabled). Nothing is
// delivered while the computer is off or asleep; after waking, reminders older
// than the grace period are not replayed — the dose stays "not marked" in the app.
import fs from "node:fs";
import path from "node:path";
import { dueReminders, nextWake, pruneDelivered } from "../core/schedule.js";
import { atomicWrite } from "./persistence.mjs";
import { reminderText } from "../core/i18n.js";

const TICK_MS = 30_000;

export class Reminders {
  // show({ title, body, key }) displays one OS notification.
  constructor(dir, persistence, show, clock = () => new Date()) {
    this.file = path.join(dir, "reminders-state.json"); // dose keys only, no medical text
    this.persistence = persistence;
    this.show = show;
    this.clock = clock;
    this.timer = null;
    try {
      this.delivered = new Set(JSON.parse(fs.readFileSync(this.file, "utf8")).delivered);
    } catch {
      this.delivered = new Set();
    }
  }
  save() {
    try {
      atomicWrite(this.file, JSON.stringify({ delivered: [...this.delivered] }));
    } catch {
      // A failed write may repeat one reminder after restart; it never loses records.
    }
  }
  check() {
    const state = this.persistence.state;
    if (!state) return [];
    const now = this.clock();
    const due = dueReminders(state, now, this.delivered);
    for (const r of due) {
      this.delivered.add(r.key);
      const course = state.courses.find((c) => c.id === r.dose.courseId);
      this.show({ key: r.key, ...reminderText(state.settings, course, r.dose) });
    }
    if (due.length) {
      this.delivered = pruneDelivered(this.delivered, now);
      this.save();
    }
    return due;
  }
  // Re-plans after any data change, resume from sleep, unlock or clock change.
  schedule() {
    clearTimeout(this.timer);
    this.check();
    const state = this.persistence.state;
    const wake = state ? nextWake(state, this.clock()) : null;
    const delay = wake === null ? TICK_MS : Math.min(Math.max(wake - this.clock().getTime() + 500, 1000), TICK_MS);
    this.timer = setTimeout(() => this.schedule(), delay);
  }
  stop() {
    clearTimeout(this.timer);
  }
}
