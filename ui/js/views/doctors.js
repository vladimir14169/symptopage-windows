// Doctors, their observations and visits. Archive keeps history; delete shows
// the exact consequences first and never deletes symptom records.
import { visitChain } from "../../../core/views.js";
import { t, esc, icon, button, fmtDay, doctorLabel } from "../format.js";
import { ui, S, change, notify, go, rerender } from "../store.js";
import { api } from "../api.js";
import { openDialog, confirmDialog } from "../dialogs.js";
import { specialtyOptions } from "./home.js";

function doctorFields(d = {}) {
  return `<label class="field">${t("doctor.specialty")}<select name="specialty" required>${specialtyOptions(d.specialty)}</select></label>
  <label class="field" data-other ${d.specialty === "other" ? "" : "hidden"}>${t("doctor.specialtyCustom")}<input name="specialtyCustom" maxlength="120" value="${esc(d.specialtyCustom ?? "")}" ${d.specialty === "other" ? "required" : ""}></label>
  <label class="field">${t("doctor.nameOptional")}<input name="name" maxlength="200" value="${esc(d.name ?? "")}"></label>
  <label class="field">${t("doctor.clinic")}<input name="clinic" maxlength="200" value="${esc(d.clinic ?? "")}"></label>
  <label class="field">${t("doctor.note")}<textarea name="note" rows="2" maxlength="4000">${esc(d.note ?? "")}</textarea></label>`;
}

function doctorDialog(d) {
  openDialog({
    title: d ? t("doctor.editTitle") : t("doctor.addTitle"),
    fields: doctorFields(d),
    submit: t("action.save"),
    onSubmit: async (f) => Boolean(await change("doctor.save", { ...(d ? { id: d.id } : {}), specialty: f.get("specialty"), specialtyCustom: f.get("specialtyCustom") ?? "", name: f.get("name"), clinic: f.get("clinic"), note: f.get("note") })),
  });
}

function observationDialog(doctorId, o, previous) {
  openDialog({
    title: o ? t("observation.editTitle") : t("observation.addTitle"),
    intro: previous ? t("observation.followUpIntro") : "",
    fields: `<label class="field">${t("observation.reason")}<textarea name="reason" rows="3" required maxlength="4000" placeholder="${t("observation.reasonHint")}">${esc(o?.reason ?? previous?.reason ?? "")}</textarea></label>
    <label class="field">${t("observation.questions")}<textarea name="questions" rows="3" maxlength="4000" placeholder="${t("observation.questionsHint")}">${esc(o?.questions ?? "")}</textarea></label>
    ${o ? "" : `<div class="grid-2"><label class="field">${t("visit.date")}<input type="date" name="visitDate" required></label><label class="field">${t("visit.timeOptional")}<input type="time" name="visitTime"></label></div>`}`,
    submit: t("action.save"),
    onSubmit: async (f) =>
      Boolean(await change("observation.save", { ...(o ? { id: o.id } : {}), doctorId, reason: f.get("reason"), questions: f.get("questions"), visitDate: f.get("visitDate"), visitTime: f.get("visitTime"), ...(previous ? { previousObservationId: previous.id } : {}) })),
  });
}

export function visitDialog(observationId, v, previousVisit) {
  const suggested = previousVisit?.outcome?.followUpDate ?? "";
  openDialog({
    title: v ? t("visit.editTitle") : previousVisit ? t("visit.followUpTitle") : t("visit.addTitle"),
    intro: previousVisit ? t("visit.followUpIntro", { date: fmtDay(previousVisit.date) }) : "",
    fields: `<div class="grid-2"><label class="field">${t("visit.date")}<input type="date" name="date" required value="${v?.date ?? suggested}"></label><label class="field">${t("visit.timeOptional")}<input type="time" name="time" value="${v?.time ?? ""}"></label></div>
    ${v ? `<label class="field">${t("visit.status")}<select name="status">${["planned", "done", "cancelled"].map((st) => `<option value="${st}" ${v.status === st ? "selected" : ""}>${t("visit.status." + st)}</option>`).join("")}</select></label>` : ""}
    ${suggested && !v ? `<p class="hint">${t("visit.suggestedFromOutcome")}</p>` : ""}`,
    submit: t("action.save"),
    onSubmit: async (f) => {
      const r = await change("visit.save", { ...(v ? { id: v.id } : {}), observationId, date: f.get("date"), time: f.get("time"), ...(v ? { status: f.get("status") } : {}), ...(previousVisit ? { previousVisitId: previousVisit.id } : {}) });
      return Boolean(r);
    },
  });
}

async function impactText(kind, id) {
  const r = await api.impact(kind, id);
  if (!r.ok) return "";
  const i = r.value;
  const rows = [["observations", i.observations], ["visits", i.visits], ["prescriptions", i.prescriptions], ["attachments", i.attachments], ["courses", i.courses], ["doseEvents", i.doseEvents], ["assessments", i.assessments]].filter(([, n]) => n);
  return `<p>${t("delete.willRemove")}</p><ul>${rows.map(([k, n]) => `<li>${t("delete." + k, { n })}</li>`).join("") || `<li>${t("delete.nothingElse")}</li>`}</ul><p>${t("delete.entriesKept", { n: i.entriesUnlinked, general: i.entriesBecomeGeneral })}</p><p class="warning">${t("delete.irreversible")}</p>`;
}

function visitRow(v) {
  const s = S();
  const chain = visitChain(s, v.id);
  return `<li class="visit-row"><div><strong>${fmtDay(v.date)}${v.time ? " · " + v.time : ""}</strong> <span class="badge ${v.status}">${t("visit.status." + v.status)}</span> <span class="muted">${t("visit.kind." + v.kind)}${chain.length > 1 ? " · " + t("visit.chain", { n: chain.length }) : ""}</span></div>
  <div class="row-actions">${button(t("visit.open"), "openVisit", { data: { id: v.id } })}${button(t("visit.followUp"), "followUpVisit", { data: { id: v.id } })}</div></li>`;
}

function observationBlock(o) {
  const s = S();
  const visits = s.visits.filter((v) => v.observationId === o.id).sort((a, b) => a.date.localeCompare(b.date));
  const previous = o.previousObservationId && s.observations.find((x) => x.id === o.previousObservationId);
  return `<section class="observation-block ${o.archivedAt ? "archived" : ""}"><header class="row"><div><h4>${esc(o.reason)}</h4><p class="meta">${t("stage." + o.stage)}${o.archivedAt ? " · " + t("observation.archived") : ""}${previous ? " · " + t("observation.continues", { reason: esc(previous.reason) }) : ""}</p></div>
  <div class="row-actions">${button(t("action.edit"), "editObservation", { data: { id: o.id } })}${button(o.archivedAt ? t("action.unarchive") : t("action.archive"), "archiveObservation", { data: { id: o.id } })}${button(t("observation.newRound"), "newRound", { data: { id: o.id } })}${button(t("action.delete"), "deleteObservation", { cls: "danger-text", data: { id: o.id } })}</div></header>
  ${o.questions ? `<p class="user-text"><strong>${t("observation.questions")}:</strong> ${esc(o.questions)}</p>` : ""}
  <ul class="visits">${visits.map(visitRow).join("")}</ul>${button(icon("plus") + t("observation.addVisit"), "addFollowUp", { data: { id: o.id } })}</section>`;
}

export function render() {
  const s = S();
  const show = ui.view.doctors ??= { archived: false };
  const list = s.doctors.filter((d) => show.archived || !d.archivedAt);
  return `<div class="row"><p class="muted">${t("doctors.intro")}</p><div class="actions"><label class="switch"><input type="checkbox" data-change="doctorsArchived" ${show.archived ? "checked" : ""}> ${t("filter.archived")}</label>${button(icon("plus") + t("doctors.add"), "addDoctor", { cls: "primary" })}</div></div>
  ${list.length ? list.map((d) => {
    const obs = s.observations.filter((o) => o.doctorId === d.id && (show.archived || !o.archivedAt));
    return `<article class="card doctor ${d.archivedAt ? "archived" : ""}"><header class="row"><div><p class="eyebrow">${esc(d.clinic)}</p><h2>${esc(doctorLabel(d))}${d.archivedAt ? ` <span class="badge">${t("doctor.archived")}</span>` : ""}</h2>${d.note ? `<p class="user-text">${esc(d.note)}</p>` : ""}</div>
    <div class="row-actions">${button(t("action.edit"), "editDoctor", { data: { id: d.id } })}${button(d.archivedAt ? t("action.unarchive") : t("action.archive"), "archiveDoctor", { data: { id: d.id } })}${button(t("action.delete"), "deleteDoctor", { cls: "danger-text", data: { id: d.id } })}</div></header>
    ${obs.map(observationBlock).join("") || `<p class="muted">${t("doctors.noObservations")}</p>`}
    ${button(icon("plus") + t("observation.add"), "addObservation", { data: { id: d.id } })}</article>`;
  }).join("") : `<p class="empty">${t("doctors.empty")}</p>`}`;
}

const find = (list, id) => S()[list].find((x) => x.id === id);
export const changes = { doctorsArchived: (el) => ((ui.view.doctors.archived = el.checked), rerender()) };
export const actions = {
  addDoctor: () => doctorDialog(),
  editDoctor: (el) => doctorDialog(find("doctors", el.dataset.id)),
  archiveDoctor: async (el) => {
    const d = find("doctors", el.dataset.id);
    if (await change("doctor.archive", { id: d.id, archived: !d.archivedAt })) notify(d.archivedAt ? t("doctor.unarchived") : t("doctor.archivedDone"));
  },
  deleteDoctor: async (el) => {
    const d = find("doctors", el.dataset.id);
    const ok = await confirmDialog({ title: t("doctor.deleteTitle", { name: esc(doctorLabel(d)) }), body: (await impactText("doctor", d.id)) + `<p>${t("delete.archiveInstead")}</p>`, confirm: t("action.deleteForever") });
    if (ok && (await change("doctor.delete", { id: d.id }))) {
      ui.filter.doctorIds = ui.filter.doctorIds.filter((x) => x !== d.id);
      notify(t("delete.done"));
    }
  },
  addObservation: (el) => observationDialog(el.dataset.id),
  editObservation: (el) => {
    const o = find("observations", el.dataset.id);
    observationDialog(o.doctorId, o);
  },
  newRound: (el) => {
    const o = find("observations", el.dataset.id);
    observationDialog(o.doctorId, null, o);
  },
  archiveObservation: async (el) => {
    const o = find("observations", el.dataset.id);
    if (await change("observation.archive", { id: o.id, archived: !o.archivedAt })) notify(o.archivedAt ? t("observation.unarchived") : t("observation.archivedDone"));
  },
  deleteObservation: async (el) => {
    const o = find("observations", el.dataset.id);
    const ok = await confirmDialog({ title: t("observation.deleteTitle"), body: await impactText("observation", o.id), confirm: t("action.deleteForever") });
    if (ok && (await change("observation.delete", { id: o.id }))) notify(t("delete.done"));
  },
  addFollowUp: (el) => {
    const visits = S().visits.filter((v) => v.observationId === el.dataset.id).sort((a, b) => b.date.localeCompare(a.date));
    visitDialog(el.dataset.id, null, visits[0]);
  },
  followUpVisit: (el) => {
    const v = find("visits", el.dataset.id);
    visitDialog(v.observationId, null, v);
  },
  openVisit: (el) => go("visit", { id: el.dataset.id }),
};
