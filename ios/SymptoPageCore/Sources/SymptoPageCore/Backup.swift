// Versioned exchange format shared with Windows (src/persistence.mjs).
// Moving a file between devices is a manual export/import — not synchronisation.
import Foundation

public struct BackupAttachment: Codable, Equatable, Sendable {
    public var id: String
    public var data: String? // base64; null when the file was missing on export
}

public struct BackupEnvelope: Codable, Sendable {
    public struct AppInfo: Codable, Sendable { public var platform: String; public var version: String }
    public var format: String = Schema.backupFormat
    public var formatVersion: Int = Schema.backupFormatVersion
    public var schemaVersion: Int = Schema.version
    public var exportedAt: String
    public var app: AppInfo
    public var data: AppState
    public var attachments: [BackupAttachment]
}

public struct MergeReport: Equatable, Sendable {
    public var added = 0, unchanged = 0, updatedFromImport = 0, keptLocal = 0
}

public enum Backup {
    public static func encode(_ state: AppState, appVersion: String, now: Date = Date(), attachments: [BackupAttachment] = []) throws -> Data {
        let env = BackupEnvelope(exportedAt: TimeUtil.iso(now), app: .init(platform: "ios", version: appVersion), data: state, attachments: attachments)
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        return try enc.encode(env)
    }

    private struct Probe: Decodable { let format: String?; let formatVersion: Int? }
    private struct DataOnly: Decodable {
        let data: AnyJSON
        let attachments: [BackupAttachment]?
    }

    /// Accepts a backup envelope (any platform) or a bare records file (v1 or v2).
    public static func decode(_ bytes: Data, now: Date = Date()) throws -> (AppState, [BackupAttachment]) {
        let probe = try? JSONDecoder().decode(Probe.self, from: bytes)
        if probe?.format == Schema.backupFormat {
            try check(probe?.formatVersion == Schema.backupFormatVersion, "BACKUP_VERSION")
            guard let env = try? JSONDecoder().decode(DataOnly.self, from: bytes) else { throw DataError("BACKUP_SHAPE") }
            let inner = try JSONEncoder().encode(env.data)
            return (try Migration.upgrade(inner, now: now).0, env.attachments ?? [])
        }
        return (try Migration.upgrade(bytes, now: now).0, [])
    }

    /// Same rules as mergeStates() in src/persistence.mjs: identical records are
    /// skipped, the later updatedAt wins, daily ratings/assessments dedupe by
    /// natural key. Repeating an import changes nothing.
    public static func merge(_ local: AppState, _ incoming: AppState) throws -> (AppState, MergeReport) {
        var next = local
        var r = MergeReport()
        func mergeList<T: Codable & Equatable & Identifiable>(_ list: inout [T], _ items: [T], changed: (T) -> String, key: ((T) -> String)?, reid: (T, String) -> T) where T.ID == String {
            for item in items {
                var i = list.firstIndex { $0.id == item.id }
                if i == nil, let key { i = list.firstIndex { key($0) == key(item) } }
                guard let idx = i else { list.append(item); r.added += 1; continue }
                if list[idx] == item { r.unchanged += 1 }
                else if changed(item) > changed(list[idx]) { list[idx] = reid(item, list[idx].id); r.updatedFromImport += 1 }
                else { r.keptLocal += 1 }
            }
        }
        mergeList(&next.doctors, incoming.doctors, changed: \.updatedAt, key: nil) { x, _ in x }
        mergeList(&next.observations, incoming.observations, changed: \.updatedAt, key: nil) { x, _ in x }
        mergeList(&next.visits, incoming.visits, changed: \.updatedAt, key: nil) { x, _ in x }
        mergeList(&next.prescriptions, incoming.prescriptions, changed: \.updatedAt, key: nil) { x, _ in x }
        mergeList(&next.courses, incoming.courses, changed: \.updatedAt, key: nil) { x, _ in x }
        mergeList(&next.doseEvents, incoming.doseEvents, changed: \.updatedAt, key: nil) { x, _ in x }
        mergeList(&next.entries, incoming.entries, changed: \.updatedAt, key: nil) { x, _ in x }
        mergeList(&next.dailyRatings, incoming.dailyRatings, changed: \.updatedAt, key: { $0.date + "/" + $0.symptomKey }) { x, id in var y = x; y.id = id; return y }
        mergeList(&next.assessments, incoming.assessments, changed: \.updatedAt, key: { $0.observationId + "/" + $0.date }) { x, id in var y = x; y.id = id; return y }
        mergeList(&next.attachments, incoming.attachments, changed: \.addedAt, key: nil) { x, _ in x }
        return (try Validator.validate(next), r)
    }
}

/// Minimal JSON value used to re-encode the `data` member of an envelope
/// before version detection (it may be a v1 or v2 records object).
indirect enum AnyJSON: Codable {
    case null, bool(Bool), number(Double), string(String), array([AnyJSON]), object([String: AnyJSON])
    init(from d: Decoder) throws {
        let c = try d.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([AnyJSON].self) { self = .array(a) }
        else { self = .object(try c.decode([String: AnyJSON].self)) }
    }
    func encode(to e: Encoder) throws {
        var c = e.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): if n == n.rounded(), abs(n) < 1e15 { try c.encode(Int(n)) } else { try c.encode(n) }
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }
}
