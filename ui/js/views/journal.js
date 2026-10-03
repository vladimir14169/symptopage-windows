// Symptom journal: search and filters, events and daily check-ins, edit/delete.
import { SYMPTOMS } from "../../../core/schema.js";
import { selectedObservations, recordsFor, searchEntries } from "../../../core/views.js";
import { symptomKey } from "../../../core/validate.js";
import { t, esc, icon, button, fmtDay, fmtDateTime, symptomLabel, intensityLabel, durationLabel, doctorLabel } from "../format.js";
import { ui, S, change, notify, filterArg, rerender } from "../store.js";
import { entryDialog, confirmDialog } from "../dialogs.js";

// Records in scope: all records when no doctor is selected; otherwise records
// linked to the selected doctors' observations, plus general ones if chosen.
export function scopedRecords(list) {
  const s = S();
  if (!ui.filter.doctorIds.length && !ui.filter.archived) {
    const hidden = new Set(s.observations.filter((o) => o.archivedAt || s.doctors.find((d) => d.id === o.doctorId).archivedAt).map((o) => o.id));
    return list.filter((r) => !r.observationIds.length || r.observationIds.some((x) => !hidden.has(x)));
  }
  if (!ui.filter.doctorIds.length) return list;
  const ids = selectedObservations(s, filterArg()).map((o) => o.id);
  return recordsFor(list, ids, { includeGeneral: ui.view.journal?.general !== false });
}

export function linkNames(r) {
  const s = S();
  if (!r.observationIds.length) return t("entry.general");
  return r.observationIds
    .map((id) => {
      const o = s.observations.find((x) => x.id === id);
      return doctorLabel(s.doctors.find((d) => d.id === o.doctorId));
    })
    .join(", ");
}

export function entryDetails(e) {
  return [e.intensity && `${t("entry.intensity")}: ${intensityLabel(e.intensity)}`, e.durationMinutes && `${t("entry.duration")}: ${durationLabel(e.durationMinutes)}`, e.count && `${t("entry.count")}: ${e.count}`, e.trigger && `${t("entry.trigger")}: ${esc(e.trigger)}`].filter(Boolean).join(" · ");
}

function entryRow(e) {
  return `<li class="entry"><div><strong>${esc(symptomLabel(e))}</strong> <time datetime="${e.occurredAt}">${fmtDateTime(e.occurredAt)}</time>
  ${entryDetails(e) ? `<p class="details">${entryDetails(e)}</p>` : ""}${e.note ? `<p class="user-text">${esc(e.note)}</p>` : ""}
  <p class="meta">${t("entry.linkedTo")}: ${esc(linkNames(e))} · ${t("entry.created")} ${fmtDateTime(e.createdAt)}${e.updatedAt !== e.createdAt ? ` · ${t("entry.updated")} ${fmtDateTime(e.updatedAt)}` : ""}</p></div>
  <div class="row-actions">${button(t("action.edit"), "editEntry", { data: { id: e.id } })}${button(t("action.delete"), "deleteEntry", { cls: "danger-text", data: { id: e.id } })}</div></li>`;
}

export function render() {
  const s = S();
  const v = (ui.view.journal ??= { query: "", symptom: "", from: "", to: "", general: true });
  const entries = searchEntries(scopedRecords(s.entries), v);
  const ratings = scopedRecords(s.dailyRatings).filter((r) => (!v.symptom || symptomKey(r) === v.symptom) && (!v.from || r.date >= v.from) && (!v.to || r.date <= v.to));
  const customs = [...new Set(s.entries.filter((e) => e.symptom === "custom").map((e) => e.customLabel))];
  return `<form class="card toolbar" role="search" data-draft="journal-search" data-submit="noop">
  <label class="field grow">${t("journal.search")}<span class="inline">${icon("search")}<input type="search" name="query" value="${esc(v.query)}" data-input="journalQuery"></span></label>
  <label class="field">${t("entry.symptom")}<select name="symptom" data-change="journalSymptom"><option value="">${t("journal.allSymptoms")}</option>${SYMPTOMS.filter((k) => k !== "custom").map((k) => `<option value="${k}" ${v.symptom === k ? "selected" : ""}>${t("symptom." + k)}</option>`).join("")}${customs.map((c) => `<option value="custom:${esc(c.toLocaleLowerCase())}" ${v.symptom === "custom:" + c.toLocaleLowerCase() ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
  <label class="field">${t("journal.from")}<input type="date" name="from" value="${v.from}" data-change="journalFrom"></label>
  <label class="field">${t("journal.to")}<input type="date" name="to" value="${v.to}" data-change="journalTo"></label>
  ${ui.filter.doctorIds.length ? `<label class="switch"><input type="checkbox" data-change="journalGeneral" ${v.general ? "checked" : ""}> ${t("journal.includeGeneral")}</label>` : ""}</form>
  <div class="row"><p class="muted" role="status">${t("journal.count", { n: entries.length })}</p>${button(icon("plus") + t("journal.add"), "now", { cls: "primary" })}</div>
  <article class="card"><h2>${t("journal.events")}</h2>${entries.length ? `<ul class="entries">${entries.map(entryRow).join("")}</ul>` : `<p class="empty">${v.query || v.symptom || v.from || v.to ? t("journal.noMatch") : t("journal.empty")}</p>`}</article>
  <article class="card"><h2>${t("journal.daily")}</h2><p class="hint">${t("daily.missingNote")}</p>${ratings.length ? `<ul class="entries">${ratings.map((r) => `<li class="entry"><div><strong>${esc(symptomLabel(r))} · ${t("frequency." + r.frequency)}</strong> <time datetime="${r.date}">${fmtDay(r.date)}</time>${r.note ? `<p class="user-text">${esc(r.note)}</p>` : ""}<p class="meta">${t("entry.linkedTo")}: ${esc(linkNames(r))}</p></div><div class="row-actions">${button(t("action.delete"), "deleteDaily", { cls: "danger-text", data: { id: r.id } })}</div></li>`).join("")}</ul>` : `<p class="empty">${t("journal.noDaily")}</p>`}</article>`;
}

const rerenderKeepingFocus = (name) => {
  rerender();
  const el = document.querySelector(`[name="${name}"]`);
  if (el) {
    el.focus();
    if (el.type === "search") el.setSelectionRange(el.value.length, el.value.length);
  }
};

export const inputs = {
  journalQuery: (el) => {
    ui.view.journal.query = el.value;
    clearTimeout(inputs.timer);
    inputs.timer = setTimeout(() => rerenderKeepingFocus("query"), 200);
  },
};
export const changes = {
  journalSymptom: (el) => ((ui.view.journal.symptom = el.value), rerenderKeepingFocus("symptom")),
  journalFrom: (el) => ((ui.view.journal.from = el.value), rerenderKeepingFocus("from")),
  journalTo: (el) => ((ui.view.journal.to = el.value), rerenderKeepingFocus("to")),
  journalGeneral: (el) => ((ui.view.journal.general = el.checked), rerenderKeepingFocus("query")),
};
export const actions = {
  editEntry: (el) => entryDialog(S().entries.find((e) => e.id === el.dataset.id)),
  deleteEntry: async (el) => {
    const e = S().entries.find((x) => x.id === el.dataset.id);
    const ok = await confirmDialog({ title: t("entry.deleteTitle"), body: `<p>${t("entry.deleteBody", { symptom: esc(symptomLabel(e)), time: fmtDateTime(e.occurredAt) })}</p>${e.observationIds.length > 1 ? `<p class="warning">${t("entry.deleteShared", { n: e.observationIds.length })}</p>` : ""}`, confirm: t("action.delete") });
    if (ok && (await change("entry.delete", { id: e.id }))) notify(t("entry.deleted"));
  },
  deleteDaily: async (el) => {
    const ok = await confirmDialog({ title: t("daily.deleteTitle"), body: `<p>${t("daily.deleteBody")}</p>`, confirm: t("action.delete") });
    if (ok && (await change("daily.delete", { id: el.dataset.id }))) notify(t("entry.deleted"));
  },
};
export const submits = { noop: () => {} };
