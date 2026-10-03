// Settings: language, reminders and lock-screen privacy, backup/restore,
// data folder, and About (brand, version, licences, limits).
import { t, esc, button } from "../format.js";
import { ui, S, change, run, notify } from "../store.js";
import { api } from "../api.js";
import { confirmDialog } from "../dialogs.js";
import { brand } from "../../brand/brand.js";
import { reminderText } from "../../../core/i18n.js";

const toggle = (name, checked, label, hint) =>
  `<label class="switch-row"><input type="checkbox" data-change="${name}" ${checked ? "checked" : ""}><span><strong>${label}</strong>${hint ? `<small>${hint}</small>` : ""}</span></label>`;

export function render() {
  const s = S();
  const snap = ui.snapshot;
  return `<article class="card"><h2>${t("settings.language")}</h2><p class="muted">${t("settings.languageHint")}</p>
  <div class="segmented" role="group" aria-label="${t("settings.language")}">${button("English", "setLanguage", { cls: s.settings.language === "en" ? "seg on" : "seg", data: { lang: "en" }, pressed: s.settings.language === "en" })}${button("Polski", "setLanguage", { cls: s.settings.language === "pl" ? "seg on" : "seg", data: { lang: "pl" }, pressed: s.settings.language === "pl" })}</div></article>

  <article class="card"><h2>${t("settings.reminders")}</h2>
  ${toggle("notifyEnabled", s.settings.notificationsEnabled, t("settings.notifyEnabled"))}
  ${toggle("notifyDetails", s.settings.notificationDetails, t("settings.notifyDetails"), t("settings.notifyDetailsHint"))}
  ${toggle("runInBackground", snap.prefs.runInBackground, t("settings.background"), t("settings.backgroundHint"))}
  <p class="note">${t("settings.notifyLimits")}</p>
  ${snap.app.notifications ? button(t("settings.testNotification"), "testNotification") : `<p class="warning">${t("settings.notifyUnsupported")}</p>`}</article>

  <article class="card"><h2>${t("settings.backup")}</h2><p class="muted">${t("settings.backupIntro")}</p>
  <div class="actions">${button(t("settings.export"), "exportBackup", { cls: "primary" })}${button(t("settings.importMerge"), "importMerge")}${button(t("settings.importReplace"), "importReplace", { cls: "danger-text" })}</div>
  <p class="hint">${t("settings.importHint")}</p>
  <h3>${t("settings.autoBackups")}</h3><p class="hint">${t("settings.autoBackupsHint")}</p>
  ${snap.backups.length ? `<ul class="plain">${snap.backups.slice(0, 8).map((b) => `<li><code>${esc(b.name)}</code> ${button(t("problem.restore"), "restoreBackup", { cls: "link", data: { name: b.name } })}</li>`).join("")}</ul>` : `<p class="muted">${t("problem.noBackups")}</p>`}
  <h3>${t("settings.local")}</h3><p class="muted">${t("settings.localDetail")}</p>${button(t("settings.showData"), "showData")}</article>

  <article class="card about"><h2>${t("settings.about")}</h2>
  <div class="about-brand">${brand.logo ? `<img src="brand/${esc(brand.logo)}" alt="${esc(brand.name)}" height="96" width="${Math.round(96 * brand.logoAspect)}">` : `<span class="brand-text big">${esc(brand.name)}</span>`}</div>
  <p>${t("settings.version", { version: esc(snap.app.version), electron: esc(snap.app.electron) })}</p>
  <p class="muted">${t("settings.aboutBody")}</p><p class="muted">${t("settings.licences")}</p><p class="warning">${t("app.disclaimer")}</p></article>`;
}

async function importBackup(mode) {
  if (mode === "replace" && !(await confirmDialog({ title: t("settings.importReplace"), body: `<p>${t("settings.replaceConfirm")}</p>`, confirm: t("settings.importReplace") }))) return;
  const r = await run(api.importBackup(mode));
  if (r?.report) {
    const rep = r.report;
    notify(rep.replaced ? t("settings.imported") : t("settings.mergeReport", { added: rep.added, unchanged: rep.unchanged, updated: rep.updatedFromImport, kept: rep.keptLocal }) + (rep.missingAttachmentFiles ? " " + t("settings.missingFiles", { n: rep.missingAttachmentFiles }) : ""));
  }
}

export const actions = {
  setLanguage: (el) => change("settings.update", { language: el.dataset.lang }),
  testNotification: async () => {
    const { title, body } = reminderText(S().settings, { name: "TEST", dose: "—" }, { time: "--:--" });
    const r = await api.testNotification(title, body);
    notify(r.ok && r.value ? t("settings.testSent") : t("settings.notifyUnsupported"));
  },
  exportBackup: async () => {
    const r = await api.exportBackup();
    if (!r.ok) notify(t("error.save"), "error");
    else if (r.value) notify(t("settings.exported"));
  },
  importMerge: () => importBackup("merge"),
  importReplace: () => importBackup("replace"),
};
export const changes = {
  notifyEnabled: (el) => change("settings.update", { notificationsEnabled: el.checked }),
  notifyDetails: (el) => change("settings.update", { notificationDetails: el.checked }),
  runInBackground: (el) => run(api.setPrefs({ runInBackground: el.checked })),
};
