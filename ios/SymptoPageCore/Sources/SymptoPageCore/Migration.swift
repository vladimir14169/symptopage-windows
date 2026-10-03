// Reading stored/imported data — port of core/migrate.js.
// v1 (Windows 0.4.0) files are migrated; newer schemas are refused, never guessed.
import Foundation

struct V1File: Decodable {
    struct V1Visit: Decodable { let id: String; let createdAt: String?; let specialist: String; let date: String; let reason: String }
    struct V1Event: Decodable { let id: String; let visitID: String; let symptom: String; let timestamp: String; let note: String }
    struct V1Answer: Decodable { let id: String; let visitID: String; let date: String; let symptom: String; let frequency: String; let note: String }
    let version: Int
    let language: String
    let visit: V1Visit?
    let events: [V1Event]
    let answers: [V1Answer]
}

private struct VersionProbe: Decodable { let schemaVersion: Int?; let version: Int? }

public struct MigrationReport: Equatable, Sendable {
    public var from: Int, to: Int, doctors: Int, observations: Int, visits: Int, entries: Int, dailyRatings: Int
}

public enum Migration {
    /// Raw JSON bytes (records file, or the `data` of a backup) → validated current state.
    public static func upgrade(_ data: Data, now: Date = Date(), newId: () -> String = { UUID().uuidString.lowercased() }) throws -> (AppState, MigrationReport?) {
        guard let probe = try? JSONDecoder().decode(VersionProbe.self, from: data) else { throw DataError("UNKNOWN_FORMAT") }
        if probe.schemaVersion == Schema.version {
            guard let s = try? JSONDecoder().decode(AppState.self, from: data) else { throw DataError("SCHEMA_SHAPE") }
            return (try Validator.validate(s), nil)
        }
        if let v = probe.schemaVersion, v > Schema.version { throw DataError("NEWER_SCHEMA") }
        if probe.schemaVersion == nil, probe.version == 1 {
            guard let v1 = try? JSONDecoder().decode(V1File.self, from: data) else { throw DataError("V1_SHAPE") }
            return try migrateV1(v1, now: now, newId: newId)
        }
        throw DataError("UNKNOWN_FORMAT")
    }

    static func migrateV1(_ v1: V1File, now: Date, newId: () -> String) throws -> (AppState, MigrationReport) {
        let v1Specialists = ["cardiologist", "neurologist", "endocrinologist", "orthopedist"]
        let v1Symptoms = ["palpitations", "dizziness", "dyspnea", "headache", "pain", "fatigue"]
        try check(["en", "pl"].contains(v1.language), "V1_SHAPE")
        let at = TimeUtil.iso(now)
        var s = AppState()
        s.settings.language = v1.language
        var report = MigrationReport(from: 1, to: Schema.version, doctors: 0, observations: 0, visits: 0, entries: 0, dailyRatings: 0)
        guard let v = v1.visit else {
            try check(v1.events.isEmpty && v1.answers.isEmpty, "V1_EVENT")
            return (try Validator.validate(s), report)
        }
        try check(v1Specialists.contains(v.specialist) && TimeUtil.isDay(v.date) && !v.reason.trimmingCharacters(in: .whitespaces).isEmpty, "V1_VISIT")
        let created = TimeUtil.isInstant(v.createdAt) ? v.createdAt! : at
        let doctorId = newId()
        s.doctors.append(Doctor(id: doctorId, specialty: v.specialist, specialtyCustom: "", name: "", clinic: "", note: "", archivedAt: nil, createdAt: created, updatedAt: at))
        s.observations.append(Observation(id: v.id, doctorId: doctorId, reason: v.reason.trimmingCharacters(in: .whitespacesAndNewlines), questions: "", stage: "waiting", stageHistory: [StageEntry(stage: "waiting", at: created)], previousObservationId: nil, archivedAt: nil, createdAt: created, updatedAt: at))
        s.visits.append(Visit(id: newId(), observationId: v.id, date: v.date, time: nil, kind: "initial", status: "planned", previousVisitId: nil, outcome: nil, createdAt: created, updatedAt: at))
        var seen = Set<String>()
        for e in v1.events {
            try check(e.visitID == v.id && !seen.contains(e.id) && TimeUtil.isInstant(e.timestamp) && v1Symptoms.contains(e.symptom), "V1_EVENT")
            seen.insert(e.id)
            s.entries.append(Entry(id: e.id, symptom: e.symptom, customLabel: "", occurredAt: e.timestamp, createdAt: e.timestamp, updatedAt: at, note: e.note.trimmingCharacters(in: .whitespacesAndNewlines), durationMinutes: nil, intensity: nil, count: nil, trigger: "", observationIds: [v.id]))
        }
        for a in v1.answers {
            try check(a.visitID == v.id && a.id == "\(a.visitID)/\(a.symptom)/\(a.date)" && TimeUtil.isDay(a.date) && v1Symptoms.contains(a.symptom) && Schema.frequencies.contains(a.frequency), "V1_ANSWER")
            s.dailyRatings.append(DailyRating(id: a.id, date: a.date, symptom: a.symptom, customLabel: "", frequency: a.frequency, note: a.note.trimmingCharacters(in: .whitespacesAndNewlines), observationIds: [v.id], createdAt: at, updatedAt: at))
        }
        report.doctors = 1; report.observations = 1; report.visits = 1
        report.entries = s.entries.count; report.dailyRatings = s.dailyRatings.count
        return (try Validator.validate(s), report)
    }
}
