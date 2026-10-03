// The renderer's only access to the desktop: explicit, validated actions.
// UI code never touches files directly (see docs/FRONTEND_INTEGRATION.md).
const { contextBridge, ipcRenderer } = require("electron");
const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld("sympto", {
  read: call("app:read"),
  change: call("store:change"),
  impact: call("store:impact"),
  setPrefs: call("prefs:set"),
  showData: call("data:show"),
  exportBackup: call("backup:export"),
  importBackup: call("backup:import"),
  restoreBackup: call("backup:restore"),
  startEmpty: call("backup:startEmpty"),
  addAttachment: call("attachment:add"),
  openAttachment: call("attachment:open"),
  exportPDF: call("report:pdf"),
  print: call("report:print"),
  testNotification: call("notify:test"),
  onNavigate: (fn) => ipcRenderer.on("navigate", (_e, page) => fn(String(page))),
});
