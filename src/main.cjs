"use strict";
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  Notification,
  Tray,
  powerMonitor,
  nativeImage,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const APP_ID = "app.symptopage.windows";
const ui = path.join(__dirname, "..", "ui", "index.html");
const uiURL = pathToFileURL(ui).href;
app.setPath(
  "userData",
  process.env.SYMPTOPAGE_TEST_DATA || path.join(app.getPath("appData"), "SymptoPage-Windows"),
);
const dataDir = () => app.getPath("userData");
// Windows toasts need an AppUserModelID matching the installer's Start-menu shortcut.
app.setAppUserModelId(APP_ID);

let win, tray, persistence, reminders, atomicWrite, prefs;
let quitting = false;
// Desktop-only preferences (not medical data, not part of backups).
const prefsFile = () => path.join(dataDir(), "preferences.json");
function readPrefs() {
  try {
    const p = JSON.parse(fs.readFileSync(prefsFile(), "utf8"));
    return { runInBackground: p.runInBackground === true };
  } catch {
    return { runInBackground: false };
  }
}

const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on("second-instance", () => showWindow());
  app.whenReady().then(start);
  app.on("before-quit", () => (quitting = true));
  app.on("window-all-closed", () => {
    if (!prefs?.runInBackground) app.quit();
  });
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function updateTray() {
  if (prefs.runInBackground && !tray) {
    const icon = nativeImage.createFromPath(path.join(__dirname, "../assets/icon.png")).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip("SymptoPage");
    tray.on("click", showWindow);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "SymptoPage", click: showWindow },
        { type: "separator" },
        { role: "quit" },
      ]),
    );
  } else if (!prefs.runInBackground && tray) {
    tray.destroy();
    tray = null;
  }
}

// Errors leave the main process only as structural codes; record contents are never logged.
function publicError(e) {
  const known = ["INVALID_DATA", "STORE_UNREADABLE", "PRINT_FAILED", "OPEN_FAILED"];
  return { ok: false, error: known.includes(e.message) ? e.message : "SAVE_FAILED", code: typeof e.code === "string" ? e.code : null };
}
const invalid = (code) => Object.assign(new Error("INVALID_DATA"), { code });

async function start() {
  const persistenceModule = await import("./persistence.mjs");
  const { Reminders } = await import("./reminders.mjs");
  atomicWrite = persistenceModule.atomicWrite;
  prefs = readPrefs();
  persistence = new persistenceModule.Persistence(dataDir(), { appVersion: app.getVersion() });

  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 760,
    minHeight: 600,
    title: "SymptoPage",
    backgroundColor: "#EAF7F5",
    icon: path.join(__dirname, "../assets/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== uiURL) event.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler((_w, _p, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.on("close", (event) => {
    if (prefs.runInBackground && !quitting) {
      event.preventDefault();
      win.hide();
    }
  });
  updateTray();

  reminders = new Reminders(dataDir(), persistence, ({ title, body }) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body });
    n.on("click", () => {
      showWindow();
      win.webContents.send("navigate", "medications");
    });
    n.show();
  });
  reminders.schedule();
  for (const e of ["resume", "unlock-screen"]) powerMonitor.on(e, () => reminders.schedule());

  const handle = (name, fn) =>
    ipcMain.handle(name, async (event, ...args) => {
      if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== uiURL)
        throw new Error("INVALID_SENDER");
      try {
        return { ok: true, value: await fn(...args) };
      } catch (e) {
        return publicError(e);
      }
    });
  const snapshot = () => ({
    state: persistence.read(),
    problem: persistence.problem,
    migration: persistence.migration,
    backups: persistence.listBackups(),
    prefs,
    app: { version: app.getVersion(), electron: process.versions.electron, notifications: Notification.isSupported() },
  });
  const changed = () => {
    reminders.schedule();
    return snapshot();
  };

  handle("app:read", snapshot);
  handle("store:change", (command, payload) => {
    const result = persistence.apply(String(command), payload);
    return { ...changed(), result };
  });
  handle("store:impact", (kind, id) => {
    if (!["doctor", "observation", "course"].includes(kind)) throw invalid("IMPACT_KIND");
    return persistence.impact(kind, String(id));
  });
  handle("prefs:set", (next) => {
    if (typeof next?.runInBackground !== "boolean") throw invalid("PREFS");
    prefs = { runInBackground: next.runInBackground };
    atomicWrite(prefsFile(), JSON.stringify(prefs));
    updateTray();
    return snapshot();
  });

  handle("data:show", () => shell.showItemInFolder(persistence.file));
  handle("backup:export", async () => {
    const choice = await dialog.showSaveDialog(win, {
      defaultPath: `SymptoPage-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "SymptoPage backup", extensions: ["json"] }],
    });
    if (choice.canceled) return false;
    atomicWrite(choice.filePath, JSON.stringify(persistence.exportBackup()));
    return true;
  });
  handle("backup:import", async (mode) => {
    if (!["merge", "replace"].includes(mode)) throw invalid("IMPORT_MODE");
    const choice = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "SymptoPage backup", extensions: ["json"] }],
    });
    if (choice.canceled) return null;
    if (fs.statSync(choice.filePaths[0]).size > 400 * 1024 * 1024) throw invalid("BACKUP_TOO_LARGE");
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(choice.filePaths[0], "utf8"));
    } catch {
      throw invalid("NOT_JSON");
    }
    const report = persistence.importBackup(parsed, mode);
    return { ...changed(), report };
  });
  handle("backup:restore", (name) => {
    persistence.restoreBackup(String(name));
    return changed();
  });
  handle("backup:startEmpty", () => {
    const kept = persistence.startEmptyKeepingDamaged();
    return { ...changed(), kept };
  });

  handle("attachment:add", async (visitId, note) => {
    const choice = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "PDF, JPEG, PNG", extensions: ["pdf", "jpg", "jpeg", "png"] }],
    });
    if (choice.canceled) return null;
    const file = choice.filePaths[0];
    const mime = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" }[path.extname(file).toLowerCase()];
    if (!mime) throw invalid("ATTACHMENT_TYPE");
    if (fs.statSync(file).size > 15 * 1024 * 1024) throw invalid("ATTACHMENT_SIZE");
    persistence.storeAttachment(String(visitId), path.basename(file), mime, fs.readFileSync(file), typeof note === "string" ? note : "");
    return changed();
  });
  handle("attachment:open", async (id) => {
    const a = persistence.state?.attachments.find((x) => x.id === id);
    if (!a) throw invalid("ATTACHMENT");
    const error = await shell.openPath(persistence.attachmentPath(a));
    if (error) throw new Error("OPEN_FAILED");
    return true;
  });

  handle("report:pdf", async (suggestedName) => {
    const choice = await dialog.showSaveDialog(win, {
      defaultPath: typeof suggestedName === "string" && /^[\w .()-]{1,80}\.pdf$/.test(suggestedName) ? suggestedName : "SymptoPage.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (choice.canceled) return false;
    const data = await win.webContents.printToPDF({ pageSize: "A4", printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(choice.filePath, data);
    return true;
  });
  handle("report:print", () =>
    new Promise((resolve, reject) =>
      win.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
        if (!success && reason !== "cancelled") reject(new Error("PRINT_FAILED"));
        else resolve(success);
      }),
    ),
  );
  handle("notify:test", (title, body) => {
    if (!Notification.isSupported()) return false;
    new Notification({ title: String(title).slice(0, 80), body: String(body).slice(0, 200) }).show();
    return true;
  });

  await win.loadFile(ui);
}
