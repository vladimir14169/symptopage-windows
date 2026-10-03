// Home: first-run welcome, next useful actions, upcoming visits, observation
// stages, daily check-in and the Now / Teraz card.
import { SPECIALTIES, STAGES, SYMPTOMS, FREQUENCIES } from "../../../core/schema.js";
import { localDay, daysBetween } from "../../../core/time.js";
import { selectedObservations, upcomingVisits, nextActions } from "../../../core/views.js";
import { symptomKey } from "../../../core/validate.js";
import { t, esc, icon, button, fmtDay, doctorLabel, symptomLabel } from "../format.js";
import { ui, S, change, go, notify, filterArg, clearDraft, rerender } from "../store.js";
import { entryDialog, defaultLinks } from "../dialogs.js";

export function specialtyOptions(selected = "") {
  return `<option value="">${t("doctor.chooseSpecialty")}</option>${SPECIALTIES.map((k) => `<option value="${k}" ${k === selected ? "selected" : ""}>${t("specialty." + k)}</option>`).join("")}`;
}

function welcome() {
  return `<div class="welcome"><section class="welcome-hero"><h2>${t("welcome.title")}</h2><p>${t("welcome.body")}</p>
  <ul class="features">${[["heart", "welcome.f1"], ["pen", "welcome.f2"], ["report", "welcome.f3"]].map(([i, k]) => `<li><span class="feature-icon">${icon(i)}</span>${t(k)}</li>`).join("")}</ul>
  <p class="muted">${t("welcome.noDemo")}</p></section>
  <article class="card"><form data-submit="firstVisit" data-draft="first-visit" class="stack"><h2>${t("welcome.formTitle")}</h2><p class="muted">${t("welcome.formIntro")}</p>
  <label class="field">${t("doctor.specialty")}<select name="specialty" required>${specialtyOptions()}</select></label>
  <label class="field" data-other hidden>${t("doctor.specialtyCustom")}<input name="specialtyCustom" maxlength="120"></label>
  <label class="field">${t("doctor.nameOptional")}<input name="name" maxlength="200" autocomplete="off"></label>
  <label class="field">${t("visit.date")}<input type="date" name="visitDate" required min="${localDay()}"></label>
  <label class="field">${t("observation.reason")}<textarea name="reason" rows="3" required maxlength="4000" placeholder="${t("observation.reasonHint")}"></textarea></label>
  <div class="actions"><button type="submit" class="primary">${icon("plus")}${t("welcome.start")}</button></div></form></article></div>`;
}

function stageStepper(o) {
  return `<ol class="stages" aria-label="${t("stage.label")}">${STAGES.map((st, i) => {
    const current = st === o.stage;
    const done = STAGES.indexOf(o.stage) > i;
    return `<li><button type="button" class="stage ${current ? "current" : done ? "done" : ""}" data-action="setStage" data-id="${o.id}" data-stage="${st}" aria-pressed="${current}" ${current ? 'aria-current="step"' : ""}><span class="dot" aria-hidden="true">${done ? "✓" : i + 1}</span><span>${t("stage." + st)}</span></button></li>`;
  }).join("")}</ol><p class="hint">${t("stage.hint")}</p>`;
}

function countdown(v) {
  const n = daysBetween(localDay(), v.date);
  return `<div class="countdown"><strong>${n === 0 ? t("visit.today") : Math.abs(n)}</strong><span>${n === 0 ? "" : n > 0 ? t("visit.daysUntil", { n }) : t("visit.daysSince", { n: -n })}</span><time datetime="${v.date}">${fmtDay(v.date)}${v.time ? " · " + v.time : ""}</time></div>`;
}

const ACTIONS = {
  confirmDose: (a) => [t("next.confirmDose", { n: a.count }), "goMedications", {}],
  recordOutcome: (a) => [t("next.recordOutcome"), "openVisit", { id: a.visitId }],
  prepareReport: () => [t("next.prepareReport"), "goReport", {}],
  reviewPrescriptions: (a) => [t("next.reviewPrescriptions"), "openObservationVisit", { id: a.observationId }],
  assessResult: () => [t("next.assessResult"), "goProgress", {}],
  addObservation: () => [t("next.addObservation"), "now", {}],
};

function nextCard() {
  const s = S();
  const actions = nextActions(s, new Date(), filterArg());
  if (!actions.length) return "";
  const obs = new Map(s.observations.map((o) => [o.id, o]));
  const doctors = new Map(s.doctors.map((d) => [d.id, d]));
  return `<article class="card next"><h2>${t("next.title")}</h2><ul class="next-list">${actions
    .slice(0, 6)
    .map((a) => {
      const [label, action, data] = ACTIONS[a.type](a);
      const o = a.observationId && obs.get(a.observationId);
      return `<li><span>${label}${o ? `<small>${esc(doctorLabel(doctors.get(o.doctorId)))}</small>` : ""}</span>${button(t("next.open"), action, { cls: "primary small", data })}</li>`;
    })
    .join("")}</ul></article>`;
}

function dailyCard() {
  const s = S();
  const v = (ui.view.daily ??= { symptom: "palpitations" });
  const today = localDay();
  const answer = s.dailyRatings.find((r) => r.date === today && symptomKey(r) === v.symptom);
  const customs = [...new Set(s.entries.concat(s.dailyRatings).filter((r) => r.symptom === "custom").map((r) => r.customLabel))];
  return `<article class="card daily"><p class="eyebrow">${t("daily.eyebrow")}</p><h2>${t("daily.question")}</h2>
  <label class="field">${t("entry.symptom")}<select data-change="dailySymptom">${SYMPTOMS.filter((k) => k !== "custom").map((k) => `<option value="${k}" ${k === v.symptom ? "selected" : ""}>${t("symptom." + k)}</option>`).join("")}${customs.map((c) => `<option value="custom:${esc(c.toLocaleLowerCase())}" data-label="${esc(c)}" ${"custom:" + c.toLocaleLowerCase() === v.symptom ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
  <div class="segmented" role="group" aria-label="${t("daily.answer")}">${FREQUENCIES.map((f) => button(t("frequency." + f), "daily", { cls: answer?.frequency === f ? "seg on" : "seg", data: { frequency: f }, pressed: answer?.frequency === f })).join("")}</div>
  ${answer ? `<p class="hint ok">${icon("check")}${t("daily.saved")}</p>` : `<p class="hint">${t("daily.missingNote")}</p>`}</article>`;
}

function observationCard(o, doctors) {
  const s = S();
  const visits = s.visits.filter((v) => v.observationId === o.id).sort((a, b) => a.date.localeCompare(b.date));
  const next = visits.find((v) => v.status === "planned" && v.date >= localDay());
  const last = visits.at(-1);
  return `<article class="card observation"><header class="row"><div><p class="eyebrow">${esc(doctorLabel(doctors.get(o.doctorId)))}</p><h3>${esc(o.reason)}</h3></div>${next ? countdown(next) : ""}</header>
  ${stageStepper(o)}<div class="actions">${last ? button(t("visit.open"), "openVisit", { data: { id: (next ?? last).id } }) : ""}${button(t("observation.addVisit"), "addFollowUp", { data: { id: o.id } })}</div></article>`;
}

export function render() {
  const s = S();
  if (!s.doctors.length) return welcome();
  const doctors = new Map(s.doctors.map((d) => [d.id, d]));
  const observations = selectedObservations(s, filterArg());
  const upcoming = upcomingVisits(s, localDay(), filterArg()).slice(0, 4);
  const obs = new Map(s.observations.map((o) => [o.id, o]));
  return `${nextCard()}<div class="grid-home">${dailyCard()}<aside class="now-card"><span class="now-icon">${icon("clock")}</span><h2>${t("now.title")}</h2><p>${t("now.body")}</p><button type="button" class="now big" data-action="now">${icon("pen")}${t("now.button")}</button><p class="hint">${t("now.hint")}</p></aside></div>
  <section aria-labelledby="up-h"><h2 id="up-h" class="section-title">${t("home.upcoming")}</h2>${upcoming.length ? `<div class="visit-strip">${upcoming.map((v) => { const o = obs.get(v.observationId); return `<button type="button" class="visit-tile" data-action="openVisit" data-id="${v.id}"><span class="eyebrow">${esc(doctorLabel(doctors.get(o.doctorId)))}</span><strong>${fmtDay(v.date)}${v.time ? " · " + v.time : ""}</strong><span>${t("visit.kind." + v.kind)} · ${esc(o.reason)}</span></button>`; }).join("")}</div>` : `<p class="muted">${t("home.noUpcoming")}</p>`}</section>
  <section aria-labelledby="obs-h"><div class="row"><h2 id="obs-h" class="section-title">${t("home.observations")}</h2>${button(icon("plus") + t("doctors.add"), "goDoctors", { cls: "secondary" })}</div>${observations.length ? observations.map((o) => observationCard(o, doctors)).join("") : `<p class="muted">${t("home.noObservations")}</p>`}</section>`;
}

export const actions = {
  setStage: async (el) => {
    const r = await change("observation.stage", { id: el.dataset.id, stage: el.dataset.stage });
    if (r) notify(t("stage.saved", { stage: t("stage." + el.dataset.stage) }));
  },
  daily: async (el) => {
    const v = ui.view.daily;
    const custom = v.symptom.startsWith("custom:");
    const label = custom ? S().entries.concat(S().dailyRatings).find((r) => r.symptom === "custom" && r.customLabel.toLocaleLowerCase() === v.symptom.slice(7))?.customLabel : "";
    const r = await change("daily.save", { date: localDay(), symptom: custom ? "custom" : v.symptom, customLabel: label, frequency: el.dataset.frequency, observationIds: defaultLinks() });
    if (r) notify(t("daily.saved"));
  },
  goMedications: () => go("medications"),
  goReport: () => go("report"),
  goProgress: () => go("progress"),
  goDoctors: () => go("doctors"),
  openVisit: (el) => go("visit", { id: el.dataset.id }),
  openObservationVisit: (el) => {
    const v = S().visits.filter((x) => x.observationId === el.dataset.id).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (v) go("visit", { id: v.id });
  },
  now: () => entryDialog(),
};

export const changes = {
  dailySymptom: (el) => {
    ui.view.daily.symptom = el.value;
    rerender();
  },
};

export const submits = {
  firstVisit: async (form, d) => {
    const doctor = await change("doctor.save", { specialty: d.get("specialty"), specialtyCustom: d.get("specialtyCustom"), name: d.get("name") }, { render: false });
    if (!doctor) return;
    const o = await change("observation.save", { doctorId: doctor.result, reason: d.get("reason"), visitDate: d.get("visitDate") });
    if (o) {
      clearDraft("first-visit");
      notify(t("welcome.created"));
    }
  },
};

// Show the custom specialty field when "Other" is selected (any form).
document.addEventListener("change", (e) => {
  if (e.target.name !== "specialty") return;
  const box = e.target.form?.querySelector("[data-other]");
  if (!box) return;
  box.hidden = e.target.value !== "other";
  box.querySelector("input").required = e.target.value === "other";
});
