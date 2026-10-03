// Help: "Seek medical help earlier than your planned appointment".
// A: contacts for the user-confirmed country, quick access to the user's own
//    history, and a clear statement that nobody monitors the records.
// B: personal urgency assessment — not available in this build (core/triage.js).
import { COUNTRIES } from "../../../core/schema.js";
import { HELP_CONTACTS, HELP_VERIFIED_ON } from "../../../core/help.js";
import { TRIAGE_ENABLED } from "../../../core/triage.js";
import { t, esc, button, fmtDay } from "../format.js";
import { S, change, go } from "../store.js";

export function render() {
  const s = S();
  const country = s.settings.country;
  const contacts = country ? HELP_CONTACTS[country] : [];
  return `<article class="card help"><h2>${t("help.title")}</h2><p>${t("help.intro")}</p>
  <p class="warning">${t("help.notMonitored")}</p>
  <label class="field">${t("help.country")}<select data-change="helpCountry"><option value="">${t("help.countryChoose")}</option>${COUNTRIES.map((c) => `<option value="${c}" ${c === country ? "selected" : ""}>${t("country." + c)}</option>`).join("")}</select></label>
  ${country ? `<ul class="contacts">${contacts.map((c) => `<li><span class="number">${esc(c.number)}</span><span>${t("contact." + c.kind)}</span></li>`).join("")}</ul><p class="hint">${t("help.verified", { date: fmtDay(HELP_VERIFIED_ON) })}</p>` : `<p class="muted">${t("help.countryFirst")}</p>`}
  <h3>${t("help.historyTitle")}</h3><p>${t("help.historyBody")}</p><div class="actions">${button(t("help.openReport"), "helpReport", { cls: "primary" })}${button(t("help.openJournal"), "helpJournal")}</div></article>
  <article class="card"><h2>${t("help.triageTitle")}</h2><p>${TRIAGE_ENABLED ? "" : t("help.triageUnavailable")}</p></article>`;
}

export const changes = {
  helpCountry: (el) => change("settings.update", { country: el.value || null }),
};
export const actions = {
  helpReport: () => go("report"),
  helpJournal: () => go("journal"),
};
