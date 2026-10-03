// The only renderer module that talks to the desktop bridge (window.sympto,
// defined in src/preload.cjs). Every call resolves to { ok, value } or
// { ok: false, error, code } and never throws.
const bridge = window.sympto;

async function call(name, ...args) {
  try {
    return await bridge[name](...args);
  } catch {
    return { ok: false, error: "SAVE_FAILED", code: null };
  }
}

export const api = {
  read: () => call("read"),
  change: (command, payload) => call("change", command, payload),
  impact: (kind, id) => call("impact", kind, id),
  setPrefs: (prefs) => call("setPrefs", prefs),
  showData: () => call("showData"),
  exportBackup: () => call("exportBackup"),
  importBackup: (mode) => call("importBackup", mode),
  restoreBackup: (name) => call("restoreBackup", name),
  startEmpty: () => call("startEmpty"),
  addAttachment: (visitId, note) => call("addAttachment", visitId, note),
  openAttachment: (id) => call("openAttachment", id),
  exportPDF: (name) => call("exportPDF", name),
  print: () => call("print"),
  testNotification: (title, body) => call("testNotification", title, body),
  onNavigate: (fn) => bridge.onNavigate?.(fn),
};
