// File-system persistence for the desktop app (main process only).
// Layout inside the data folder:
//   records.json                 current data (schema v2), written atomically
//   backups/*.json               automatic safety copies (pre-migration, pre-import, pre-restore)
//   attachments/<id><ext>        attached documents/photos
//   records.unreadable-<ts>.json a damaged file moved aside only on explicit user request
// Nothing here logs record contents.
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { emptyState, BACKUP_FORMAT, BACKUP_FORMAT_VERSION, ATTACHMENT_TYPES, SCHEMA_VERSION } from "../core/schema.js";
import { upgrade, detectVersion } from "../core/migrate.js";
import { apply, deletionImpact } from "../core/commands.js";
import { validateState, DataError, symptomKey } from "../core/validate.js";

const MAX_BACKUPS = 30;
const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, "-");

export function atomicWrite(file, data) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(temp, "wx", 0o600);
    try {
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export class Persistence {
  constructor(dir, { appVersion = "dev", newId = randomUUID, clock = () => new Date() } = {}) {
    this.dir = dir;
    this.file = path.join(dir, "records.json");
    this.backupDir = path.join(dir, "backups");
    this.attachmentDir = path.join(dir, "attachments");
    this.appVersion = appVersion;
    this.newId = newId;
    this.clock = clock;
    this.state = null;
    this.problem = null; // { code } when data could not be opened
    this.migration = null;
    fs.mkdirSync(dir, { recursive: true });
    this.open();
  }

  open() {
    this.problem = null;
    let raw;
    try {
      raw = fs.readFileSync(this.file);
    } catch (e) {
      if (e.code === "ENOENT") {
        this.state = emptyState();
        return;
      }
      this.state = null;
      this.problem = { code: "READ_FAILED" };
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
    } catch {
      this.state = null;
      this.problem = { code: "NOT_JSON" };
      return;
    }
    const version = detectVersion(parsed);
    try {
      const { state, report } = upgrade(parsed, { now: this.clock(), newId: this.newId });
      if (version !== SCHEMA_VERSION) {
        // Exact original bytes are kept before the migrated state is committed.
        const backup = this.writeBackup(raw, `pre-migration-v${version}`);
        this.commit(state);
        this.migration = { ...report, backup: path.basename(backup) };
      } else this.state = state;
    } catch (e) {
      this.state = null;
      this.problem = { code: e instanceof DataError ? e.code : "OPEN_FAILED" };
    }
  }

  commit(next) {
    validateState(next);
    atomicWrite(this.file, JSON.stringify(next, null, 2));
    this.state = next;
  }

  read() {
    return structuredClone(this.state);
  }

  apply(command, payload) {
    if (!this.state) throw new DataError("STORE_UNREADABLE");
    const { state, result } = apply(this.state, command, payload, { now: this.clock(), newId: this.newId });
    this.commit(state);
    for (const id of result?.removedAttachments ?? []) this.removeAttachmentFile(id);
    return result;
  }

  impact(kind, id) {
    return deletionImpact(this.state, kind, id);
  }

  // ---- automatic safety copies ----
  writeBackup(bytes, reason) {
    fs.mkdirSync(this.backupDir, { recursive: true });
    const file = path.join(this.backupDir, `${stamp(this.clock())}-${reason}.json`);
    atomicWrite(file, bytes);
    const all = this.listBackups();
    for (const old of all.slice(MAX_BACKUPS)) fs.rmSync(path.join(this.backupDir, old.name), { force: true });
    return file;
  }
  backupCurrent(reason) {
    if (fs.existsSync(this.file)) return this.writeBackup(fs.readFileSync(this.file), reason);
    return null;
  }
  listBackups() {
    if (!fs.existsSync(this.backupDir)) return [];
    return fs
      .readdirSync(this.backupDir)
      .filter((n) => n.endsWith(".json"))
      .sort()
      .reverse()
      .map((name) => ({ name, size: fs.statSync(path.join(this.backupDir, name)).size }));
  }
  restoreBackup(name) {
    if (!this.listBackups().some((b) => b.name === name)) throw new DataError("BACKUP_MISSING");
    const raw = fs.readFileSync(path.join(this.backupDir, name));
    const { state } = upgrade(JSON.parse(raw.toString("utf8")), { now: this.clock(), newId: this.newId });
    if (this.state) this.backupCurrent("pre-restore");
    else this.setAsideUnreadable();
    this.commit(state);
    this.problem = null;
  }
  // Only on explicit user request: keeps the damaged file and starts empty.
  setAsideUnreadable() {
    if (!fs.existsSync(this.file)) return null;
    const target = path.join(this.dir, `records.unreadable-${stamp(this.clock())}.json`);
    fs.renameSync(this.file, target);
    return path.basename(target);
  }
  startEmptyKeepingDamaged() {
    const kept = this.setAsideUnreadable();
    this.state = emptyState();
    this.commit(this.state);
    this.problem = null;
    return kept;
  }

  // ---- attachments ----
  attachmentPath(a) {
    return path.join(this.attachmentDir, a.id + ATTACHMENT_TYPES[a.mime]);
  }
  storeAttachment(visitId, fileName, mime, bytes, note = "") {
    const id = this.newId();
    fs.mkdirSync(this.attachmentDir, { recursive: true });
    const file = path.join(this.attachmentDir, id + (ATTACHMENT_TYPES[mime] ?? ""));
    atomicWrite(file, bytes);
    try {
      this.apply("attachment.add", { id, visitId, fileName, mime, size: bytes.length, sha256: sha256(bytes), note });
    } catch (e) {
      fs.rmSync(file, { force: true });
      throw e;
    }
    return id;
  }
  removeAttachmentFile(id) {
    if (!fs.existsSync(this.attachmentDir)) return;
    for (const n of fs.readdirSync(this.attachmentDir)) if (n.startsWith(id + ".")) fs.rmSync(path.join(this.attachmentDir, n), { force: true });
  }

  // ---- export / import (versioned, platform-neutral; also read by the iOS client) ----
  exportBackup() {
    const attachments = this.state.attachments.map((a) => {
      const p = this.attachmentPath(a);
      return { id: a.id, data: fs.existsSync(p) ? fs.readFileSync(p).toString("base64") : null };
    });
    return {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: this.clock().toISOString(),
      app: { platform: "windows", version: this.appVersion },
      data: this.read(),
      attachments,
    };
  }

  // mode: "merge" (default) or "replace". Accepts a backup envelope or a bare
  // records.json (v1 or v2). Returns counts; nothing is written unless the
  // whole result validates.
  importBackup(input, mode = "merge") {
    if (!this.state) throw new DataError("STORE_UNREADABLE");
    let data = input, files = [];
    if (input && input.format === BACKUP_FORMAT) {
      if (input.formatVersion !== BACKUP_FORMAT_VERSION) throw new DataError("BACKUP_VERSION");
      data = input.data;
      files = Array.isArray(input.attachments) ? input.attachments : [];
    }
    const { state: incoming } = upgrade(data, { now: this.clock(), newId: this.newId });
    const bytes = new Map();
    for (const a of incoming.attachments) {
      const f = files.find((x) => x.id === a.id);
      if (!f?.data) continue; // metadata kept; file reported missing
      const buf = Buffer.from(f.data, "base64");
      if (sha256(buf) !== a.sha256) throw new DataError("ATTACHMENT_HASH");
      bytes.set(a.id, buf);
    }
    const { state: next, report } = mode === "replace" ? { state: incoming, report: { replaced: true } } : mergeStates(this.state, incoming);
    validateState(next);
    this.backupCurrent(`pre-import-${mode}`);
    fs.mkdirSync(this.attachmentDir, { recursive: true });
    for (const a of next.attachments) {
      const buf = bytes.get(a.id);
      if (buf && !fs.existsSync(this.attachmentPath(a))) atomicWrite(this.attachmentPath(a), buf);
    }
    this.commit(next);
    report.missingAttachmentFiles = next.attachments.filter((a) => !fs.existsSync(this.attachmentPath(a))).length;
    return report;
  }
}

const COLLECTIONS = ["doctors", "observations", "visits", "prescriptions", "courses", "doseEvents", "entries", "dailyRatings", "assessments", "attachments"];
const naturalKey = {
  dailyRatings: (r) => r.date + "/" + symptomKey(r),
  assessments: (a) => a.observationId + "/" + a.date,
};
const changedAt = (x) => x.updatedAt ?? x.addedAt ?? "";

// Merge by stable ID. Identical records are skipped (re-importing the same file
// is a no-op); for differing versions the later updatedAt wins. Records with the
// same natural key (one daily rating per day and symptom) are deduplicated too.
export function mergeStates(local, incoming) {
  const next = structuredClone(local);
  const report = { added: 0, unchanged: 0, updatedFromImport: 0, keptLocal: 0 };
  for (const c of COLLECTIONS) {
    const index = new Map(next[c].map((x, i) => [x.id, i]));
    const keyIndex = naturalKey[c] ? new Map(next[c].map((x, i) => [naturalKey[c](x), i])) : null;
    for (const item of incoming[c]) {
      let i = index.get(item.id);
      if (i === undefined && keyIndex) i = keyIndex.get(naturalKey[c](item));
      if (i === undefined) {
        next[c].push(structuredClone(item));
        index.set(item.id, next[c].length - 1);
        report.added++;
      } else if (JSON.stringify(next[c][i]) === JSON.stringify(item)) report.unchanged++;
      else if (changedAt(item) > changedAt(next[c][i])) {
        next[c][i] = structuredClone({ ...item, id: next[c][i].id });
        report.updatedFromImport++;
      } else report.keptLocal++;
    }
  }
  return { state: next, report };
}
