// App state holder for the iOS client. Persists the same records.json format as
// Windows (schema v2) in Application Support with complete file protection.
// Rules shared with Windows (src/persistence.mjs):
//  - every change is validated by SymptoPageCore before it is written;
//  - writes are atomic; a failed write keeps the previous state in memory and on disk;
//  - a v0.4.0 file is copied to backups/ before migration;
//  - an unreadable file is never overwritten; the user chooses what to do.
import Foundation
import Observation
import SymptoPageCore

@MainActor
@Observable
final class AppModel {
    private(set) var state: AppState?
    private(set) var problem: String?          // structural code when data could not be opened
    private(set) var migrationNote: String?
    var lastError: String?
    var filterDoctorIds: [String] = []         // [] = all doctors
    var translator: Translator

    let dir: URL
    var file: URL { dir.appendingPathComponent("records.json") }
    var backups: URL { dir.appendingPathComponent("backups", isDirectory: true) }
    let notifications = NotificationPlanner()

    init(directory: URL? = nil) {
        let base = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("SymptoPage", isDirectory: true)
        dir = base
        let json = Bundle.main.url(forResource: "i18n", withExtension: "json").flatMap { try? Data(contentsOf: $0) } ?? Data("{}".utf8)
        translator = (try? Translator(json: json, language: "en")) ?? (try! Translator(json: Data(#"{"en":{},"pl":{}}"#.utf8), language: "en"))
        open()
    }

    func t(_ key: String, _ vars: [String: CustomStringConvertible] = [:]) -> String { translator.t(key, vars) }

    // MARK: loading

    func open() {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        guard let raw = try? Data(contentsOf: file) else {
            if FileManager.default.fileExists(atPath: file.path) { problem = "READ_FAILED"; state = nil } else { state = AppState() }
            applyLanguage(); return
        }
        do {
            let (s, report) = try Migration.upgrade(raw)
            if let report {
                try writeBackup(raw, reason: "pre-migration-v\(report.from)")
                try write(s)
                migrationNote = t("migration.done", ["entries": report.entries, "backup": "backups/"])
            }
            state = s
        } catch let e as DataError {
            state = nil; problem = e.code
        } catch {
            state = nil; problem = "OPEN_FAILED"
        }
        applyLanguage()
    }

    private func applyLanguage() { translator.language = state?.settings.language ?? Locale.preferredLanguages.first.map { $0.hasPrefix("pl") ? "pl" : "en" } ?? "en" }

    // MARK: writing

    private func write(_ s: AppState) throws {
        try Validator.validate(s)
        let data = try JSONEncoder.pretty.encode(s)
        try data.write(to: file, options: [.atomic, .completeFileProtection])
    }

    private func writeBackup(_ bytes: Data, reason: String) throws {
        try FileManager.default.createDirectory(at: backups, withIntermediateDirectories: true)
        let stamp = TimeUtil.iso(Date()).replacingOccurrences(of: ":", with: "-").replacingOccurrences(of: ".", with: "-")
        try bytes.write(to: backups.appendingPathComponent("\(stamp)-\(reason).json"), options: [.atomic, .completeFileProtection])
    }

    /// Runs a pure command from SymptoPageCore and commits it. Returns false and
    /// sets `lastError` on invalid input or a failed write; nothing changes then.
    @discardableResult
    func change(_ body: (AppState, CommandContext) throws -> AppState) -> Bool {
        guard let current = state else { lastError = t("error.unreadable"); return false }
        do {
            let next = try body(current, CommandContext())
            try write(next)
            state = next
            applyLanguage()
            Task { await notifications.replan(next, translator: translator) }
            return true
        } catch is DataError {
            lastError = t("error.invalid"); return false
        } catch {
            lastError = t("error.save"); return false
        }
    }

    // MARK: recovery & exchange

    /// Keeps the damaged file (renamed) and starts empty. Only on explicit request.
    func startEmptyKeepingDamaged() {
        let stamp = TimeUtil.iso(Date()).replacingOccurrences(of: ":", with: "-")
        if FileManager.default.fileExists(atPath: file.path) {
            try? FileManager.default.moveItem(at: file, to: dir.appendingPathComponent("records.unreadable-\(stamp).json"))
        }
        state = AppState(); problem = nil
        try? write(AppState())
    }

    func exportBackup() throws -> Data {
        guard let s = state else { throw DataError("STORE_UNREADABLE") }
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "dev"
        return try Backup.encode(s, appVersion: version)
    }

    /// Merge (default) or replace. A safety copy of the current file is written first.
    func importBackup(_ bytes: Data, replace: Bool) -> String {
        guard let current = state else { return t("error.unreadable") }
        do {
            let (incoming, _) = try Backup.decode(bytes)
            if let raw = try? Data(contentsOf: file) { try writeBackup(raw, reason: replace ? "pre-import-replace" : "pre-import-merge") }
            if replace {
                try write(incoming); state = incoming
                applyLanguage()
                Task { await notifications.replan(incoming, translator: translator) }
                return t("settings.imported")
            }
            let (merged, r) = try Backup.merge(current, incoming)
            try write(merged); state = merged
            applyLanguage()
            Task { await notifications.replan(merged, translator: translator) }
            return t("settings.mergeReport", ["added": r.added, "unchanged": r.unchanged, "updated": r.updatedFromImport, "kept": r.keptLocal])
        } catch {
            return t("error.invalid")
        }
    }

    // MARK: derived

    var visibleObservations: [Observation] {
        guard let s = state else { return [] }
        return s.observations.filter { o in
            guard o.archivedAt == nil, let d = s.doctors.first(where: { $0.id == o.doctorId }), d.archivedAt == nil else { return false }
            return filterDoctorIds.isEmpty || filterDoctorIds.contains(o.doctorId)
        }
    }

    func doctorLabel(_ id: String) -> String {
        guard let d = state?.doctors.first(where: { $0.id == id }) else { return "" }
        let spec = d.specialty == "other" ? d.specialtyCustom : t("specialty." + d.specialty)
        return [spec, d.name].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    func symptomLabel(_ symptom: String, _ custom: String) -> String { symptom == "custom" ? custom : t("symptom." + symptom) }
}

extension JSONEncoder {
    static var pretty: JSONEncoder { let e = JSONEncoder(); e.outputFormatting = [.prettyPrinted]; return e }
}
