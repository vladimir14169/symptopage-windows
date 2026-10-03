// Medication courses recorded exactly as prescribed, and dose confirmation.
// The app never derives a schedule from a drug name and never suggests changing,
// doubling or stopping a dose. A reminder is not a taken dose; the end of a
// course is not a recovery.
import { localDay, addDays, wallClock } from "../../../core/time.js";
import { plannedDoses } from "../../../core/schedule.js";
import { selectedObservations } from "../../../core/views.js";
import { t, esc, icon, button, fmtDay, fmtTime, fmtWeekday, doctorLabel, localInputValue } from "../format.js";
import { ui, S, change, notify, filterArg } from "../store.js";
import { openDialog, confirmDialog } from "../dialogs.js";

export function courseDialog({ course, observationId, prescriptionId = null, prescriptionText = "" }) {
  const s = S();
  const c = course ?? { name: "", dose: "", instructions: "", startDate: localDay(), endDate: "", indefinite: false, times: [], days: [1, 2, 3, 4, 5, 6, 7] };
  const doctors = new Map(s.doctors.map((d) => [d.id, d]));
  const observations = selectedObservations(s, { archived: false });
  const obsId = course?.observationId ?? observationId;
  openDialog({
    title: course ? t("course.editTitle") : t("course.addTitle"),
    intro: `${t("course.intro")}${prescriptionText ? `<br><strong>${t("course.fromPrescription")}:</strong> ${esc(prescriptionText)}` : ""}`,
    wide: true,
    fields: `<label class="field">${t("course.observation")}<select name="observationId" required>${observations.map((o) => `<option value="${o.id}" ${o.id === obsId ? "selected" : ""}>${esc(doctorLabel(doctors.get(o.doctorId)))} — ${esc(o.reason)}</option>`).join("")}</select></label>
    <div class="grid-2"><label class="field">${t("course.name")}<input name="name" required maxlength="200" value="${esc(c.name)}"></label>
    <label class="field">${t("course.dose")}<input name="dose" required maxlength="200" value="${esc(c.dose)}" placeholder="${t("course.doseHint")}"></label></div>
    <label class="field">${t("course.instructions")}<textarea name="instructions" rows="2" maxlength="4000">${esc(c.instructions)}</textarea></label>
    <div class="grid-2"><label class="field">${t("course.start")}<input type="date" name="startDate" required value="${c.startDate}"></label>
    <label class="field">${t("course.end")}<input type="date" name="endDate" value="${c.endDate ?? ""}" ${c.indefinite ? "disabled" : "required"}></label></div>
    <label class="check"><input type="checkbox" name="indefinite" value="1" ${c.indefinite ? "checked" : ""}> ${t("course.indefinite")}</label>
    <fieldset><legend>${t("course.times")}</legend><div class="times">${[0, 1, 2, 3, 4, 5].map((i) => `<input type="time" name="times" aria-label="${t("course.timeN", { n: i + 1 })}" value="${c.times[i] ?? ""}">`).join("")}</div><p class="hint">${t("course.timesHint")}</p></fieldset>
    <fieldset class="chips"><legend>${t("course.days")}</legend>${[1, 2, 3, 4, 5, 6, 7].map((d) => `<label class="chip-choice"><input type="checkbox" name="days" value="${d}" ${c.days.includes(d) ? "checked" : ""}><span>${fmtWeekday(d)}</span></label>`).join("")}</fieldset>
    <p class="warning">${t("course.safety")}</p>`,
    submit: t("action.save"),
    onSubmit: async (f) => {
      const times = f.getAll("times").filter(Boolean);
      if (!times.length || !f.getAll("days").length) {
        notify(t("course.needTimes"), "error");
        return false;
      }
      const indefinite = f.has("indefinite");
      const r = await change("course.save", {
        ...(course ? { id: course.id } : {}),
        observationId: f.get("observationId"),
        prescriptionId: course?.prescriptionId ?? prescriptionId,
        name: f.get("name"), dose: f.get("dose"), instructions: f.get("instructions"),
        startDate: f.get("startDate"), endDate: indefinite ? null : f.get("endDate"), indefinite,
        times, days: f.getAll("days").map(Number),
      });
      if (r) notify(t("course.saved"));
      return Boolean(r);
    },
  });
  const form = document.querySelector("#modal form");
  form.indefinite.addEventListener("change", () => {
    form.endDate.disabled = form.indefinite.checked;
    form.endDate.required = !form.indefinite.checked;
  });
}

function takenDialog(dose) {
  openDialog({
    title: t("dose.takenTitle"),
    fields: `<label class="field">${t("dose.actualTime")}<input type="datetime-local" name="actualAt" required value="${localInputValue(new Date().toISOString())}" max="${localInputValue(new Date().toISOString())}"></label><p class="hint">${t("dose.plannedAt", { time: dose.time, date: fmtDay(dose.date) })}</p>`,
    submit: t("dose.taken"),
    onSubmit: async (f) => Boolean(await change("dose.mark", { courseId: dose.courseId, date: dose.date, time: dose.time, status: "taken", actualAt: new Date(f.get("actualAt")).toISOString() })),
  });
}

const statusText = (d) =>
  d.status === "taken" ? t("dose.status.taken", { time: fmtTime(d.event.actualAt) })
  : d.status === "snoozed" ? t("dose.status.snoozed", { time: fmtTime(d.event.snoozedUntil) })
  : t("dose.status." + d.status);

function doseRow(d, courses) {
  const c = courses.get(d.courseId);
  return `<li class="dose ${d.status}"><div><strong>${d.time}</strong> · ${esc(c.name)} — ${esc(c.dose)}<p class="meta">${esc(c.instructions)}</p><p class="status" aria-live="polite">${statusText(d)}</p></div>
  <div class="row-actions" role="group" aria-label="${t("dose.actions", { name: esc(c.name), time: d.time })}">${button(t("dose.taken"), "doseTaken", { cls: d.status === "taken" ? "seg on" : "seg", data: { id: d.id }, pressed: d.status === "taken" })}${button(t("dose.skipped"), "doseMark", { cls: d.status === "skipped" ? "seg on" : "seg", data: { id: d.id, status: "skipped" }, pressed: d.status === "skipped" })}
  <select data-change="doseSnooze" data-id="${d.id}" aria-label="${t("dose.snooze")}"><option value="">${t("dose.snooze")}…</option>${[10, 30, 60].map((m) => `<option value="${m}">${t("unit.minutes", { n: m })}</option>`).join("")}</select>
  ${d.status !== "pending" ? button(t("dose.clear"), "doseClear", { cls: "link", data: { id: d.event.id } }) : ""}</div></li>`;
}

export function render() {
  const s = S();
  const doctors = new Map(s.doctors.map((d) => [d.id, d]));
  const obs = selectedObservations(s, filterArg());
  const obsIds = new Set(obs.map((o) => o.id));
  const courses = s.courses.filter((c) => obsIds.has(c.observationId));
  const byId = new Map(courses.map((c) => [c.id, c]));
  const today = localDay();
  const all = plannedDoses({ ...s, courses }, addDays(today, -6), today);
  const todays = all.filter((d) => d.date === today);
  ui.view.doses = new Map(all.map((d) => [d.id, d]));
  const history = all.filter((d) => d.date < today).reverse();
  return `<p class="note">${t("med.notice")}</p>
  <article class="card"><h2>${t("med.today")}</h2>${todays.length ? `<ul class="doses">${todays.map((d) => doseRow(d, byId)).join("")}</ul>` : `<p class="empty">${t("med.noneToday")}</p>`}</article>
  <article class="card"><div class="row"><h2>${t("med.courses")}</h2>${obs.length ? button(icon("plus") + t("course.add"), "addCourse", { cls: "primary" }) : ""}</div>
  ${courses.length ? `<ul class="entries">${courses.map((c) => {
    const o = s.observations.find((x) => x.id === c.observationId);
    const ended = c.stoppedAt || (!c.indefinite && c.endDate < today);
    return `<li class="entry ${ended ? "ended" : ""}"><div><strong>${esc(c.name)} — ${esc(c.dose)}</strong> ${ended ? `<span class="badge">${t("course.ended")}</span>` : ""}<p class="meta">${esc(doctorLabel(doctors.get(o.doctorId)))} · ${fmtDay(c.startDate)} – ${c.indefinite ? t("course.noEnd") : fmtDay(c.endDate)} · ${c.times.join(", ")} · ${c.days.length === 7 ? t("course.everyDay") : c.days.map(fmtWeekday).join(", ")}</p>${c.instructions ? `<p class="user-text">${esc(c.instructions)}</p>` : ""}${c.stoppedAt ? `<p class="meta">${t("course.stoppedOn", { date: fmtDay(localDay(new Date(c.stoppedAt))) })}</p>` : ""}</div>
    <div class="row-actions">${button(t("action.edit"), "editCourse", { data: { id: c.id } })}${button(c.stoppedAt ? t("course.resume") : t("course.stop"), "stopCourse", { data: { id: c.id } })}${button(t("action.delete"), "deleteCourse", { cls: "danger-text", data: { id: c.id } })}</div></li>`;
  }).join("")}</ul>` : `<p class="empty">${obs.length ? t("med.noCourses") : t("med.needObservation")}</p>`}
  <p class="hint">${t("course.endNotRecovery")}</p></article>
  <article class="card"><h2>${t("med.history")}</h2>${history.length ? `<table class="table"><caption class="sr-only">${t("med.history")}</caption><thead><tr><th scope="col">${t("med.planned")}</th><th scope="col">${t("course.name")}</th><th scope="col">${t("med.status")}</th></tr></thead><tbody>${history.map((d) => `<tr class="${d.status}"><td>${fmtDay(d.date)} ${d.time}</td><td>${esc(byId.get(d.courseId).name)}</td><td>${statusText(d)} ${d.status === "pending" ? button(t("dose.markLate"), "doseTaken", { cls: "link", data: { id: d.id } }) : ""}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">${t("med.noHistory")}</p>`}</article>`;
}

const dose = (id) => ui.view.doses.get(id);
export const actions = {
  addCourse: () => courseDialog({ observationId: selectedObservations(S(), filterArg())[0]?.id }),
  editCourse: (el) => courseDialog({ course: S().courses.find((c) => c.id === el.dataset.id) }),
  stopCourse: async (el) => {
    const c = S().courses.find((x) => x.id === el.dataset.id);
    if (!c.stoppedAt && !(await confirmDialog({ title: t("course.stopTitle"), body: `<p>${t("course.stopBody")}</p>`, confirm: t("course.stop"), danger: false }))) return;
    await change("course.stop", { id: c.id, stopped: !c.stoppedAt });
  },
  deleteCourse: async (el) => {
    const c = S().courses.find((x) => x.id === el.dataset.id);
    const n = S().doseEvents.filter((e) => e.courseId === c.id).length;
    const ok = await confirmDialog({ title: t("course.deleteTitle"), body: `<p>${t("course.deleteBody", { n })}</p><p>${t("course.deleteInstead")}</p>`, confirm: t("action.deleteForever") });
    if (ok && (await change("course.delete", { id: c.id }))) notify(t("delete.done"));
  },
  doseTaken: (el) => {
    const d = dose(el.dataset.id);
    // Same-day confirmation records "now"; a later correction asks for the actual time.
    if (d.date === localDay() && d.status !== "taken" && wallClock(d.date, d.time) <= new Date(Date.now() + 3 * 3600000))
      return change("dose.mark", { courseId: d.courseId, date: d.date, time: d.time, status: "taken" }).then((r) => r && notify(t("dose.recorded")));
    takenDialog(d);
  },
  doseMark: (el) => {
    const d = dose(el.dataset.id);
    return change("dose.mark", { courseId: d.courseId, date: d.date, time: d.time, status: el.dataset.status });
  },
  doseClear: (el) => change("dose.clear", { id: el.dataset.id }),
};
export const changes = {
  doseSnooze: (el) => {
    const d = dose(el.dataset.id);
    if (el.value) change("dose.mark", { courseId: d.courseId, date: d.date, time: d.time, status: "snoozed", snoozeMinutes: Number(el.value) });
  },
};
