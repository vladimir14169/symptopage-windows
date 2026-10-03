// Visit results: the user's notes, prescriptions/tests with deadlines, attached
// documents, follow-up date and the doctor's recorded advice on returning.
// Each item shows where it came from (typed by the user / copied from a document).
// No text recognition: documents are stored as files, nothing is read from them.
import { PRESCRIPTION_KINDS, SOURCES } from "../../../core/schema.js";
import { visitChain } from "../../../core/views.js";
import { t, esc, icon, button, fmtDay, fmtDateTime, doctorLabel } from "../format.js";
import { ui, S, change, notify, go, run } from "../store.js";
import { api } from "../api.js";
import { openDialog, confirmDialog } from "../dialogs.js";
import { visitDialog } from "./doctors.js";
import { courseDialog } from "./medications.js";

const sourceSelect = (current = "user") =>
  `<label class="field">${t("source.label")}<select name="source">${SOURCES.map((s) => `<option value="${s}" ${s === current ? "selected" : ""}>${t("source." + s)}</option>`).join("")}</select></label>`;
const sourceBadge = (s) => `<span class="badge source">${t("source." + s)}</span>`;

function prescriptionDialog(visitId, p) {
  openDialog({
    title: p ? t("prescription.editTitle") : t("prescription.addTitle"),
    intro: t("prescription.intro"),
    fields: `<label class="field">${t("prescription.kind")}<select name="kind">${PRESCRIPTION_KINDS.map((k) => `<option value="${k}" ${p?.kind === k ? "selected" : ""}>${t("prescription.kind." + k)}</option>`).join("")}</select></label>
    <label class="field">${t("prescription.text")}<textarea name="text" rows="3" required maxlength="4000">${esc(p?.text ?? "")}</textarea></label>
    <label class="field">${t("prescription.due")}<input type="date" name="dueDate" value="${p?.dueDate ?? ""}"></label>${sourceSelect(p?.source)}`,
    submit: t("action.save"),
    onSubmit: async (f) => Boolean(await change("prescription.save", { ...(p ? { id: p.id } : {}), visitId, kind: f.get("kind"), text: f.get("text"), dueDate: f.get("dueDate"), source: f.get("source") })),
  });
}

export function render() {
  const s = S();
  const v = s.visits.find((x) => x.id === ui.params.id);
  if (!v) return `<p class="empty">${t("visit.missing")}</p>${button(t("nav.doctors"), "goDoctors")}`;
  const o = s.observations.find((x) => x.id === v.observationId);
  const d = s.doctors.find((x) => x.id === o.doctorId);
  const out = v.outcome ?? { notes: "", recommendations: "", followUpDate: null, returnAdvice: "", source: "user" };
  const prescriptions = s.prescriptions.filter((p) => p.visitId === v.id);
  const attachments = s.attachments.filter((a) => a.visitId === v.id);
  const chain = visitChain(s, v.id);
  const courses = s.courses.filter((c) => prescriptions.some((p) => p.id === c.prescriptionId));
  return `${button("← " + t("nav.doctors"), "goDoctors", { cls: "link" })}
  <article class="card"><header class="row"><div><p class="eyebrow">${esc(doctorLabel(d))}</p><h2>${fmtDay(v.date)}${v.time ? " · " + v.time : ""} <span class="badge ${v.status}">${t("visit.status." + v.status)}</span></h2><p class="muted">${esc(o.reason)}</p></div>
  <div class="row-actions">${button(t("action.edit"), "editVisit", { data: { id: v.id } })}${button(t("visit.followUp"), "followUpVisit", { data: { id: v.id } })}${button(t("action.delete"), "deleteVisit", { cls: "danger-text", data: { id: v.id } })}</div></header>
  ${chain.length > 1 ? `<p class="meta">${t("visit.chainList")}: ${chain.map((c) => (c.id === v.id ? `<strong>${fmtDay(c.date)}</strong>` : button(fmtDay(c.date), "openVisit", { cls: "link", data: { id: c.id } }))).join(" → ")}</p>` : ""}</article>

  <article class="card"><h2>${t("outcome.title")}</h2><p class="hint">${t("outcome.intro")}</p>
  <form class="stack" data-submit="saveOutcome" data-draft="outcome-${v.id}" data-id="${v.id}">
  <label class="field">${t("outcome.notes")}<textarea name="notes" rows="4" maxlength="4000">${esc(out.notes)}</textarea></label>
  <label class="field">${t("outcome.recommendations")}<textarea name="recommendations" rows="3" maxlength="4000">${esc(out.recommendations)}</textarea></label>
  <label class="field">${t("outcome.returnAdvice")}<textarea name="returnAdvice" rows="2" maxlength="4000" placeholder="${t("outcome.returnAdviceHint")}">${esc(out.returnAdvice)}</textarea></label>
  <div class="grid-2"><label class="field">${t("outcome.followUpDate")}<input type="date" name="followUpDate" value="${out.followUpDate ?? ""}"></label>${sourceSelect(out.source)}</div>
  <div class="actions"><button class="primary" type="submit">${t("outcome.save")}</button></div></form></article>

  <article class="card"><div class="row"><h2>${t("prescription.title")}</h2>${button(icon("plus") + t("prescription.add"), "addPrescription", { cls: "primary", data: { id: v.id } })}</div>
  ${prescriptions.length ? `<ul class="entries">${prescriptions.map((p) => {
    const linked = s.courses.filter((c) => c.prescriptionId === p.id);
    return `<li class="entry"><div><strong>${t("prescription.kind." + p.kind)}</strong> ${sourceBadge(p.source)}<p class="user-text">${esc(p.text)}</p>${p.dueDate ? `<p class="meta">${t("prescription.due")}: ${fmtDay(p.dueDate)}</p>` : ""}${linked.length ? `<p class="meta">${t("prescription.courses")}: ${linked.map((c) => esc(c.name)).join(", ")}</p>` : ""}</div>
    <div class="row-actions">${p.kind === "medication" ? button(t("prescription.toCourse"), "courseFromPrescription", { data: { id: p.id } }) : ""}${button(t("action.edit"), "editPrescription", { data: { id: p.id } })}${button(t("action.delete"), "deletePrescription", { cls: "danger-text", data: { id: p.id } })}</div></li>`;
  }).join("")}</ul>` : `<p class="empty">${t("prescription.empty")}</p>`}
  ${courses.length ? `<p class="hint">${t("prescription.coursesHint")}</p>` : ""}</article>

  <article class="card"><div class="row"><h2>${t("attachment.title")}</h2>${button(icon("file") + t("attachment.add"), "addAttachment", { data: { id: v.id } })}</div><p class="hint">${t("attachment.intro")}</p>
  ${attachments.length ? `<ul class="entries">${attachments.map((a) => `<li class="entry"><div><strong>${esc(a.fileName)}</strong> ${sourceBadge(a.source)}<p class="meta">${Math.ceil(a.size / 1024)} KB · ${fmtDateTime(a.addedAt)}</p></div><div class="row-actions">${button(t("attachment.open"), "openAttachment", { data: { id: a.id } })}${button(t("action.delete"), "deleteAttachment", { cls: "danger-text", data: { id: a.id } })}</div></li>`).join("")}</ul>` : `<p class="empty">${t("attachment.empty")}</p>`}</article>`;
}

const find = (list, id) => S()[list].find((x) => x.id === id);
export const submits = {
  saveOutcome: async (form, f) => {
    const r = await change("visit.outcome", { id: form.dataset.id, notes: f.get("notes"), recommendations: f.get("recommendations"), returnAdvice: f.get("returnAdvice"), followUpDate: f.get("followUpDate"), source: f.get("source") });
    if (r) notify(t("outcome.saved"));
  },
};
export const actions = {
  goDoctors: () => go("doctors"),
  editVisit: (el) => {
    const v = find("visits", el.dataset.id);
    visitDialog(v.observationId, v);
  },
  deleteVisit: async (el) => {
    const v = find("visits", el.dataset.id);
    const n = { p: S().prescriptions.filter((p) => p.visitId === v.id).length, a: S().attachments.filter((a) => a.visitId === v.id).length };
    const ok = await confirmDialog({ title: t("visit.deleteTitle"), body: `<p>${t("visit.deleteBody", { prescriptions: n.p, attachments: n.a })}</p><p class="warning">${t("delete.irreversible")}</p>`, confirm: t("action.deleteForever") });
    if (ok && (await change("visit.delete", { id: v.id }, { render: false }))) {
      notify(t("delete.done"));
      go("doctors");
    }
  },
  addPrescription: (el) => prescriptionDialog(el.dataset.id),
  editPrescription: (el) => {
    const p = find("prescriptions", el.dataset.id);
    prescriptionDialog(p.visitId, p);
  },
  deletePrescription: async (el) => {
    const ok = await confirmDialog({ title: t("prescription.deleteTitle"), body: `<p>${t("prescription.deleteBody")}</p>`, confirm: t("action.delete") });
    if (ok && (await change("prescription.delete", { id: el.dataset.id }))) notify(t("delete.done"));
  },
  courseFromPrescription: (el) => {
    const p = find("prescriptions", el.dataset.id);
    const v = find("visits", p.visitId);
    courseDialog({ observationId: v.observationId, prescriptionId: p.id, prescriptionText: p.text });
  },
  addAttachment: async (el) => {
    if (await run(api.addAttachment(el.dataset.id, ""))) notify(t("attachment.added"));
  },
  openAttachment: async (el) => {
    const r = await api.openAttachment(el.dataset.id);
    if (!r.ok) notify(t("error.open"), "error");
  },
  deleteAttachment: async (el) => {
    const ok = await confirmDialog({ title: t("attachment.deleteTitle"), body: `<p>${t("attachment.deleteBody")}</p>`, confirm: t("action.delete") });
    if (ok && (await change("attachment.delete", { id: el.dataset.id }))) notify(t("delete.done"));
  },
};
