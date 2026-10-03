// Planned doses and reminder planning. Pure.
// Rule: a course's times are local wall-clock times ("08:00" means 08:00 in the
// device's current time zone on that day). After a time-zone change the plan
// follows the new local clock; DST gaps shift a dose forward (see time.wallClock).
import { addDays, weekday, wallClock, localDay } from "./time.js";
import { doseId } from "./validate.js";

export function courseActiveOn(course, date) {
  if (course.stoppedAt && date > localDay(new Date(course.stoppedAt))) return false;
  if (date < course.startDate) return false;
  if (!course.indefinite && date > course.endDate) return false;
  return course.days.includes(weekday(date));
}

// Planned doses with their recorded status (or "pending" = not marked yet).
export function plannedDoses(state, fromDate, toDate) {
  const events = new Map(state.doseEvents.map((e) => [e.id, e]));
  const out = [];
  for (const course of state.courses) {
    for (let d = fromDate; d <= toDate; d = addDays(d, 1)) {
      if (!courseActiveOn(course, d)) continue;
      for (const time of course.times) {
        const id = doseId(course.id, d, time);
        const event = events.get(id) ?? null;
        out.push({
          id, courseId: course.id, date: d, time,
          at: wallClock(d, time).toISOString(),
          status: event?.status ?? "pending",
          event,
        });
      }
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

// Reminders that should be shown at `now`. A reminder is shown at most once per
// key (dose ID, or dose ID + snooze time); `delivered` is the persisted set of
// keys already shown. Missed reminders older than `graceMinutes` are not shown
// late (the dose stays "not marked" in the app) — avoids a burst after sleep.
export function dueReminders(state, now, delivered, graceMinutes = 30) {
  if (!state.settings.notificationsEnabled) return [];
  const today = localDay(now);
  const from = addDays(today, -1);
  const t = now.getTime();
  const out = [];
  for (const dose of plannedDoses(state, from, today)) {
    let key = dose.id, at = Date.parse(dose.at);
    if (dose.status === "taken" || dose.status === "skipped") continue;
    if (dose.status === "snoozed") {
      key = dose.id + "#" + dose.event.snoozedUntil;
      at = Date.parse(dose.event.snoozedUntil);
    }
    if (at <= t && t - at <= graceMinutes * 60000 && !delivered.has(key))
      out.push({ key, dose });
  }
  return out;
}

// Next time the scheduler should wake up (ms timestamp) or null.
export function nextWake(state, now) {
  if (!state.settings.notificationsEnabled) return null;
  const t = now.getTime();
  const today = localDay(now);
  let best = null;
  for (const dose of plannedDoses(state, today, addDays(today, 2))) {
    if (dose.status === "taken" || dose.status === "skipped") continue;
    const at = Date.parse(dose.status === "snoozed" ? dose.event.snoozedUntil : dose.at);
    if (at > t && (best === null || at < best)) best = at;
  }
  return best;
}

// Keys older than two days are dropped so the delivered set stays small.
export function pruneDelivered(delivered, now) {
  const limit = localDay(new Date(now.getTime() - 2 * 86400000));
  return new Set([...delivered].filter((k) => (k.match(/@(\d{4}-\d{2}-\d{2})T/)?.[1] ?? "") >= limit));
}
