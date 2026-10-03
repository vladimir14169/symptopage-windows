// Renderer state: the last snapshot from the main process plus view state
// (page, filters, drafts). The renderer never mutates records itself; it sends
// commands and replaces its snapshot with the validated result.
import { api } from "./api.js";
import { t, setLanguage } from "./format.js";

export const ui = {
  snapshot: null,
  page: "home",
  params: {},
  // Doctor filter: [] = all doctors. multi = several doctors may be toggled.
  filter: { doctorIds: [], multi: false, archived: false },
  busy: false,
  view: {}, // per-page transient state (search text, report options …)
};
export const S = () => ui.snapshot.state;

let renderer = () => {};
export const onRender = (fn) => (renderer = fn);
export const rerender = () => renderer();

export function accept(snapshot) {
  ui.snapshot = { ...ui.snapshot, ...snapshot };
  if (ui.snapshot.state) setLanguage(ui.snapshot.state.settings.language);
}

export function notify(message, kind = "info") {
  const n = document.querySelector("#notice");
  n.textContent = message;
  n.dataset.kind = kind;
  n.classList.add("visible");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => n.classList.remove("visible"), 6000);
}

export function errorMessage(r) {
  if (r.error === "INVALID_DATA") return t("error.invalid");
  if (r.error === "STORE_UNREADABLE") return t("error.unreadable");
  if (r.error === "PRINT_FAILED") return t("error.print");
  if (r.error === "OPEN_FAILED") return t("error.open");
  return t("error.save");
}

// Sends one command. Returns { result } on success, null on failure (the user
// is told; committed data is unchanged).
export async function change(command, payload, { render = true } = {}) {
  if (ui.busy) return null;
  ui.busy = true;
  try {
    const r = await api.change(command, payload);
    if (!r.ok) {
      notify(errorMessage(r), "error");
      return null;
    }
    accept(r.value);
    if (render) rerender();
    return { result: r.value.result };
  } finally {
    ui.busy = false;
  }
}

// Runs any other bridge call that returns a fresh snapshot.
export async function run(promise) {
  const r = await promise;
  if (!r.ok) {
    notify(errorMessage(r), "error");
    return null;
  }
  if (r.value && typeof r.value === "object" && "state" in r.value) accept(r.value);
  rerender();
  return r.value ?? true;
}

export function go(page, params = {}) {
  ui.page = page;
  ui.params = params;
  rerender();
  document.querySelector("main")?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

export const filterArg = () => ({ doctorIds: ui.filter.doctorIds, archived: ui.filter.archived });

// ---- unsaved input survives re-rendering (filter switches, language change) ----
const drafts = new Map();
export function saveDrafts(root) {
  for (const form of root.querySelectorAll("form[data-draft]")) {
    const values = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === "checkbox") (values[el.name] ??= []).push(...(el.checked ? [el.value] : []));
      else if (el.type === "radio") { if (el.checked) values[el.name] = el.value; }
      else values[el.name] = el.value;
    }
    drafts.set(form.dataset.draft, values);
  }
}
export function restoreDrafts(root) {
  for (const form of root.querySelectorAll("form[data-draft]")) {
    const values = drafts.get(form.dataset.draft);
    if (!values) continue;
    for (const el of form.elements) {
      if (!el.name || !(el.name in values)) continue;
      const v = values[el.name];
      if (el.type === "checkbox") el.checked = v.includes(el.value);
      else if (el.type === "radio") el.checked = v === el.value;
      else el.value = v;
    }
  }
}
export const clearDraft = (key) => drafts.delete(key);
