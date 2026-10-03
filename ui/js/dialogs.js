// Modal dialogs: generic form dialog, confirmation, and the quick symptom entry.
import { SYMPTOMS, INTENSITIES } from "../../core/schema.js";
import { selectedObservations } from "../../core/views.js";
import { t, esc, fmtDateTime, localInputValue, symptomLabel, doctorLabel, attrs } from "./format.js";
import { S, ui, change, notify } from "./store.js";

const modal = () => document.querySelector("#modal");
let opener = null;

// fields: HTML; onSubmit(FormData, form) → truthy to close.
export function openDialog({ title, intro = "", fields, submit, onSubmit, danger = false, wide = false }) {
  opener = document.activeElement;
  const m = modal();
  m.className = wide ? "wide" : "";
  m.innerHTML = `<form method="dialog" novalidate><header class="dialog-head"><h2 id="dialog-title">${title}</h2><button type="button" class="icon-button" data-close aria-label="${t("action.close")}">✕</button></header>${intro ? `<p class="muted">${intro}</p>` : ""}<div class="dialog-body">${fields}</div><p class="form-error" role="alert" hidden></p><div class="actions"><button type="button" class="secondary" data-close>${t("action.cancel")}</button><button type="submit" class="${danger ? "danger" : "primary"}">${submit}</button></div></form>`;
  m.setAttribute("aria-labelledby", "dialog-title");
  m.showModal();
  m.querySelector("input:not([type=hidden]),select,textarea,button[type=submit]")?.focus();
  const form = m.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorBox = form.querySelector(".form-error");
    errorBox.hidden = true;
    const invalid = [...form.elements].find((el) => el.willValidate && !el.checkValidity());
    if (invalid) {
      errorBox.textContent = t("error.fillRequired");
      errorBox.hidden = false;
      invalid.focus();
      return;
    }
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      if (await onSubmit(new FormData(form), form)) closeDialog();
    } finally {
      button.disabled = false;
    }
  });
  for (const b of m.querySelectorAll("[data-close]")) b.addEventListener("click", closeDialog);
}

export function closeDialog() {
  const m = modal();
  if (m.open) m.close();
  m.innerHTML = "";
  opener?.focus?.();
}

export function confirmDialog({ title, body, confirm, danger = true }) {
  return new Promise((resolve) => {
    let answered = false;
    openDialog({
      title, fields: body, submit: confirm, danger,
      onSubmit: () => ((answered = true), resolve(true), true),
    });
    modal().addEventListener("close", () => answered || resolve(false), { once: true });
  });
}

// Checkbox list of observations; used by entry, daily and report forms.
export function observationPicker(name, checked, { legend } = {}) {
  const s = S();
  const doctors = new Map(s.doctors.map((d) => [d.id, d]));
  const list = selectedObservations(s, { archived: false });
  if (!list.length) return `<p class="hint">${t("entry.noObservations")}</p>`;
  return `<fieldset class="checks"><legend>${legend ?? t("entry.links")}</legend>${list
    .map((o) => `<label class="check"><input type="checkbox" name="${name}" value="${o.id}" ${checked.includes(o.id) ? "checked" : ""}><span>${esc(doctorLabel(doctors.get(o.doctorId)))} — ${esc(o.reason)}</span></label>`)
    .join("")}</fieldset><p class="hint">${t("entry.linksHint")}</p>`;
}

// Default links for a new record: observations of the doctors in the filter,
// or the only active observation. Otherwise the record stays general.
export function defaultLinks() {
  const active = selectedObservations(S(), { archived: false });
  if (ui.filter.doctorIds.length) return active.filter((o) => ui.filter.doctorIds.includes(o.doctorId)).map((o) => o.id);
  return active.length === 1 ? [active[0].id] : [];
}

function symptomChoices(current) {
  return `<fieldset class="chips" role="radiogroup"><legend>${t("entry.symptom")}</legend>${SYMPTOMS.map(
    (k) => `<label class="chip-choice"><input type="radio" name="symptom" value="${k}" required ${current?.symptom === k ? "checked" : ""}><span>${k === "custom" ? t("symptom.customChoice") : t("symptom." + k)}</span></label>`,
  ).join("")}</fieldset><label class="field custom-symptom">${t("entry.customLabel")}<input name="customLabel" maxlength="120" list="custom-symptoms" value="${esc(current?.customLabel ?? "")}"></label><datalist id="custom-symptoms">${[...new Set(S().entries.filter((e) => e.symptom === "custom").map((e) => e.customLabel))].map((l) => `<option value="${esc(l)}">`).join("")}</datalist>`;
}

// Quick entry ("Now / Teraz"): the event time is the moment of the click and
// can be corrected. Extra fields are folded away until needed.
export function entryDialog(existing = null) {
  const capturedAt = existing?.occurredAt ?? new Date().toISOString();
  const e = existing ?? {};
  const fields = `
    ${symptomChoices(existing)}
    <label class="field">${t("entry.time")}<input type="datetime-local" name="occurredAt" required value="${localInputValue(capturedAt)}" max="${localInputValue(new Date().toISOString())}"></label>
    <p class="hint">${existing ? t("entry.timeEdit", { created: fmtDateTime(existing.createdAt) }) : t("entry.timeCaptured")}</p>
    <label class="field">${t("entry.note")}<textarea name="note" rows="3" maxlength="4000">${esc(e.note ?? "")}</textarea></label>
    <details ${e.durationMinutes || e.intensity || e.count || e.trigger ? "open" : ""}><summary>${t("entry.more")}</summary>
      <fieldset class="chips"><legend>${t("entry.intensity")}</legend>
        <label class="chip-choice"><input type="radio" name="intensity" value="" ${!e.intensity ? "checked" : ""}><span>${t("entry.notSet")}</span></label>
        ${INTENSITIES.map((n) => `<label class="chip-choice"><input type="radio" name="intensity" value="${n}" ${e.intensity === n ? "checked" : ""}><span>${t("intensity." + n)}</span></label>`).join("")}
      </fieldset>
      <div class="grid-2">
        <label class="field">${t("entry.duration")}<span class="inline"><input type="number" name="durationValue" min="1" max="20160" inputmode="numeric" value="${e.durationMinutes ? (e.durationMinutes % 60 === 0 ? e.durationMinutes / 60 : e.durationMinutes) : ""}"><select name="durationUnit" aria-label="${t("entry.durationUnit")}"><option value="1" ${e.durationMinutes && e.durationMinutes % 60 ? "selected" : ""}>${t("unit.min")}</option><option value="60" ${e.durationMinutes && e.durationMinutes % 60 === 0 ? "selected" : ""}>${t("unit.h")}</option></select></span></label>
        <label class="field">${t("entry.count")}<input type="number" name="count" min="1" max="1000" inputmode="numeric" value="${e.count ?? ""}"></label>
      </div>
      <label class="field">${t("entry.trigger")}<input name="trigger" maxlength="1000" value="${esc(e.trigger ?? "")}"></label>
      ${observationPicker("observationIds", existing ? e.observationIds : defaultLinks())}
    </details>`;
  openDialog({
    title: existing ? t("entry.editTitle") : t("entry.newTitle"),
    intro: existing ? "" : t("entry.intro"),
    fields,
    submit: t("entry.save"),
    onSubmit: async (d) => {
      const symptom = d.get("symptom");
      if (symptom === "custom" && !String(d.get("customLabel")).trim()) {
        notify(t("entry.customRequired"), "error");
        return false;
      }
      const value = Number(d.get("durationValue"));
      const payload = {
        ...(existing ? { id: existing.id } : {}),
        symptom,
        customLabel: symptom === "custom" ? d.get("customLabel") : "",
        occurredAt: new Date(d.get("occurredAt")).toISOString(),
        note: d.get("note"),
        intensity: d.get("intensity") || null,
        durationMinutes: value ? Math.round(value * Number(d.get("durationUnit"))) : null,
        count: d.get("count") || null,
        trigger: d.get("trigger") ?? "",
        observationIds: d.has("observationIds") || existing ? d.getAll("observationIds") : defaultLinks(),
      };
      const r = await change("entry.save", payload);
      if (r) notify(t("entry.saved"));
      return Boolean(r);
    },
  });
  // Show the custom label field only when "Other" is chosen.
  const form = modal().querySelector("form");
  const sync = () => {
    const custom = form.querySelector('input[name=symptom][value=custom]').checked;
    const box = form.querySelector(".custom-symptom");
    box.hidden = !custom;
    box.querySelector("input").required = custom;
  };
  form.addEventListener("change", sync);
  sync();
}

export { attrs };
