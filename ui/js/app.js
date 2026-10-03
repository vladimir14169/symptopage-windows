// Application shell: navigation, doctor filter, language, data-problem screen,
// and event delegation to the page modules in ./views.
import { api } from "./api.js";
import { brand } from "../brand/brand.js";
import { t, esc, icon, button, doctorLabel, lang } from "./format.js";
import { ui, S, accept, onRender, rerender, change, run, go, notify, saveDrafts, restoreDrafts } from "./store.js";
import { entryDialog, confirmDialog } from "./dialogs.js";
import * as home from "./views/home.js";
import * as journal from "./views/journal.js";
import * as doctors from "./views/doctors.js";
import * as visit from "./views/visit.js";
import * as medications from "./views/medications.js";
import * as progress from "./views/progress.js";
import * as report from "./views/report.js";
import * as help from "./views/help.js";
import * as settings from "./views/settings.js";

const pages = { home, journal, doctors, visit, medications, progress, report, help, settings };
const NAV = [
  ["home", "home"], ["journal", "journal"], ["doctors", "doctor"], ["medications", "pill"],
  ["progress", "chart"], ["report", "report"], ["help", "help"], ["settings", "settings"],
];
const FILTERED = new Set(["home", "journal", "medications", "progress", "report"]);
const root = document.querySelector("#app");

const brandMark = () =>
  brand.logo
    ? `<img class="brand-logo" src="brand/${esc(brand.logo)}" alt="${esc(brand.name)}" height="${brand.logoMaxHeight}" width="${Math.round(brand.logoMaxHeight * brand.logoAspect)}">`
    : `<span class="brand-text">${esc(brand.name)}</span>`;

function filterBar() {
  const s = S();
  const list = s.doctors.filter((d) => ui.filter.archived || !d.archivedAt);
  if (!list.length) return "";
  const sel = ui.filter.doctorIds;
  const chips = list
    .map((d) => {
      const on = sel.includes(d.id);
      return `<button type="button" class="chip ${on ? "on" : ""}" data-action="filterDoctor" data-id="${d.id}" aria-pressed="${on}">${ui.filter.multi ? `<span class="box" aria-hidden="true">${on ? "✓" : ""}</span>` : ""}${esc(doctorLabel(d))}${d.archivedAt ? ` <small>(${t("doctor.archived")})</small>` : ""}</button>`;
    })
    .join("");
  const active = sel.length
    ? `<p class="active-filter" role="status">${t("filter.showing")}: <strong>${sel.map((id) => esc(doctorLabel(s.doctors.find((d) => d.id === id)))).join(", ")}</strong> ${button(t("filter.clear"), "filterAll", { cls: "link" })}</p>`
    : `<p class="active-filter" role="status">${t("filter.showingAll")}</p>`;
  return `<nav class="filters" aria-label="${t("filter.label")}"><div class="chip-row"><button type="button" class="chip ${sel.length ? "" : "on"}" data-action="filterAll" aria-pressed="${!sel.length}">${t("filter.all")}</button>${chips}</div><div class="filter-tools"><label class="switch"><input type="checkbox" data-change="filterMulti" ${ui.filter.multi ? "checked" : ""}> ${t("filter.multi")}</label><label class="switch"><input type="checkbox" data-change="filterArchived" ${ui.filter.archived ? "checked" : ""}> ${t("filter.archived")}</label></div>${active}</nav>`;
}

function problemScreen() {
  const { problem, backups } = ui.snapshot;
  return `<article class="card problem"><h2>${t("problem.title")}</h2><p>${t("problem.body")}</p><p class="muted">${t("problem.code")}: <code>${esc(problem.code)}</code></p>
  <div class="actions">${button(t("settings.showData"), "showData")}</div>
  <h3>${t("problem.restoreTitle")}</h3>${backups.length ? `<ul class="plain">${backups.slice(0, 10).map((b) => `<li>${esc(b.name)} ${button(t("problem.restore"), "restoreBackup", { data: { name: b.name } })}</li>`).join("")}</ul>` : `<p class="muted">${t("problem.noBackups")}</p>`}
  <h3>${t("problem.freshTitle")}</h3><p class="muted">${t("problem.freshBody")}</p>${button(t("problem.fresh"), "startEmpty", { cls: "danger" })}</article>`;
}

function shell(content) {
  const page = ui.page;
  const s = S();
  return `<a class="skip" href="#main">${t("a11y.skip")}</a>
  <aside class="sidebar"><div class="brand">${brandMark()}</div><p class="tagline">${t("app.tagline")}</p>
  <nav aria-label="${t("nav.label")}">${NAV.map(([p, i]) => `<button type="button" data-page="${p}" ${p === page || (page === "visit" && p === "doctors") ? 'aria-current="page"' : ""} ${s ? "" : "disabled"}>${icon(i)}<span>${t("nav." + p)}</span></button>`).join("")}</nav>
  <p class="sidebar-note">${t("app.notMonitored")}</p></aside>
  <main id="main" tabindex="-1"><header class="topbar"><div><h1>${t("page." + page)}</h1></div><div class="top-actions">
  <label class="sr-only" for="language">${t("settings.language")}</label><select id="language" data-change="language"><option value="en" ${lang() === "en" ? "selected" : ""}>English</option><option value="pl" ${lang() === "pl" ? "selected" : ""}>Polski</option></select>
  ${s ? `<button type="button" class="now" data-action="now" aria-describedby="now-hint">${icon("pen")}${t("now.button")}</button><span id="now-hint" class="sr-only">${t("now.hint")}</span>` : ""}</div></header>
  ${s && FILTERED.has(page) ? filterBar() : ""}<div class="content">${content}</div>
  <footer>${t("app.privacy")}</footer></main>`;
}

function render() {
  saveDrafts(root);
  const snap = ui.snapshot;
  document.documentElement.lang = lang();
  if (!snap.state) {
    root.innerHTML = shell(problemScreen());
  } else {
    const view = pages[ui.page] ?? home;
    root.innerHTML = shell(view.render());
  }
  restoreDrafts(root);
  document.querySelector("#print-report").innerHTML = snap.state ? report.printHTML() : "";
}
onRender(render);

const shellActions = {
  now: () => entryDialog(),
  filterAll: () => ((ui.filter.doctorIds = []), rerender()),
  filterDoctor: (el) => {
    const id = el.dataset.id;
    const sel = ui.filter.doctorIds;
    if (ui.filter.multi) ui.filter.doctorIds = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
    else ui.filter.doctorIds = sel.length === 1 && sel[0] === id ? [] : [id];
    rerender();
  },
  showData: () => api.showData(),
  restoreBackup: async (el) => {
    if (await confirmDialog({ title: t("problem.restore"), body: `<p>${t("problem.restoreConfirm", { name: esc(el.dataset.name) })}</p>`, confirm: t("problem.restore"), danger: false }))
      if (await run(api.restoreBackup(el.dataset.name))) notify(t("problem.restored"));
  },
  startEmpty: async () => {
    if (await confirmDialog({ title: t("problem.fresh"), body: `<p>${t("problem.freshConfirm")}</p>`, confirm: t("problem.fresh") })) {
      const r = await run(api.startEmpty());
      if (r) notify(t("problem.freshDone", { name: r.kept ?? "-" }));
    }
  },
};
const shellChanges = {
  language: (el) => change("settings.update", { language: el.value }),
  filterMulti: (el) => {
    ui.filter.multi = el.checked;
    if (!el.checked && ui.filter.doctorIds.length > 1) ui.filter.doctorIds = ui.filter.doctorIds.slice(0, 1);
    rerender();
  },
  filterArchived: (el) => ((ui.filter.archived = el.checked), rerender()),
};

const handlerFor = (kind, name) => {
  const local = pages[ui.page]?.[kind]?.[name];
  if (local) return local;
  for (const p of Object.values(pages)) if (p[kind]?.[name]) return p[kind][name];
  return (kind === "actions" ? shellActions : shellChanges)[name];
};

document.addEventListener("click", async (e) => {
  const b = e.target.closest("button,[data-action]");
  if (!b || b.disabled || b.closest("#modal")) return;
  if (b.dataset.page) return go(b.dataset.page);
  const fn = b.dataset.action && handlerFor("actions", b.dataset.action);
  if (fn) {
    e.preventDefault();
    await fn(b, e);
  }
});
document.addEventListener("change", async (e) => {
  const fn = e.target.dataset?.change && handlerFor("changes", e.target.dataset.change);
  if (fn && !e.target.closest("#modal")) await fn(e.target, e);
});
document.addEventListener("input", (e) => {
  const fn = e.target.dataset?.input && handlerFor("inputs", e.target.dataset.input);
  if (fn) fn(e.target, e);
});
document.addEventListener("submit", async (e) => {
  const form = e.target;
  if (form.closest("#modal")) return;
  const fn = form.dataset.submit && handlerFor("submits", form.dataset.submit);
  if (fn) {
    e.preventDefault();
    await fn(form, new FormData(form));
  }
});
// Ctrl+N (or Cmd+N) opens quick entry anywhere.
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n" && ui.snapshot?.state && !document.querySelector("#modal").open) {
    e.preventDefault();
    entryDialog();
  }
});
api.onNavigate((page) => pages[page] && go(page));

const r = await api.read();
if (r.ok) accept(r.value);
else accept({ state: null, problem: { code: r.code ?? "READ_FAILED" }, backups: [] });
if (ui.snapshot.migration) notify(t("migration.done", { entries: ui.snapshot.migration.entries, backup: ui.snapshot.migration.backup }));
render();
