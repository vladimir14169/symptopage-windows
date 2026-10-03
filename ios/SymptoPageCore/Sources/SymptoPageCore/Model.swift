// Data model v2 — mirrors core/schema.js and docs/DATA_MODEL.md exactly.
// Instants are ISO-8601 strings and calendar days "YYYY-MM-DD", as in the JSON
// file, so a file written by one platform is byte-for-byte meaningful to the other.
// Optional values are always written as explicit `null` (the Windows validator
// requires the keys to be present).
import Foundation

public enum Schema {
    public static let version = 2
    public static let backupFormat = "symptopage-backup"
    public static let backupFormatVersion = 1
    public static let languages = ["en", "pl"]
    public static let specialties = ["cardiologist", "neurologist", "endocrinologist", "orthopedist", "internist", "gp", "other"]
    public static let symptoms = ["palpitations", "dizziness", "dyspnea", "headache", "pain", "fatigue", "custom"]
    public static let stages = ["waiting", "visited", "treatment", "followup", "closed"]
    public static let frequencies = ["none", "once", "several"]
    public static let intensities = [1, 2, 3, 4]
    public static let visitKinds = ["initial", "followup"]
    public static let visitStatuses = ["planned", "done", "cancelled"]
    public static let prescriptionKinds = ["medication", "test", "other"]
    public static let sources = ["user", "document"]
    public static let doseStatuses = ["taken", "skipped", "snoozed"]
    public static let ratings = ["better", "same", "worse"]
    public static let countries = ["PL", "DE", "GB", "IE", "US", "EU"]
    public static let attachmentTypes = ["application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png"]
    public static let maxText = 4000
}

public struct Settings: Codable, Equatable, Sendable {
    public var language: String
    public var notificationsEnabled: Bool
    public var notificationDetails: Bool
    public var country: String?
    public init(language: String = "en", notificationsEnabled: Bool = true, notificationDetails: Bool = false, country: String? = nil) {
        self.language = language; self.notificationsEnabled = notificationsEnabled
        self.notificationDetails = notificationDetails; self.country = country
    }
    enum CodingKeys: String, CodingKey { case language, notificationsEnabled, notificationDetails, country }
    public func encode(to e: Encoder) throws {
        var c = e.container(keyedBy: CodingKeys.self)
        try c.encode(language, forKey: .language); try c.encode(notificationsEnabled, forKey: .notificationsEnabled)
        try c.encode(notificationDetails, forKey: .notificationDetails); try c.encode(country, forKey: .country)
    }
}

public struct Doctor: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var specialty: String
    public var specialtyCustom: String
    public var name: String
    public var clinic: String
    public var note: String
    public var archivedAt: String?
    public var createdAt: String
    public var updatedAt: String
    enum CodingKeys: String, CodingKey { case id, specialty, specialtyCustom, name, clinic, note, archivedAt, createdAt, updatedAt }
    public func encode(to e: Encoder) throws {
        var c = e.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(specialty, forKey: .specialty); try c.encode(specialtyCustom, forKey: .specialtyCustom)
        try c.encode(name, forKey: .name); try c.encode(clinic, forKey: .clinic); try c.encode(note, forKey: .note)
        try c.encode(archivedAt, forKey: .archivedAt); try c.encode(createdAt, forKey: .createdAt); try c.encode(updatedAt, forKey: .updatedAt)
    }
}

public struct StageEntry: Codable, Equatable, Sendable {
    public var stage: String
    public var at: String
}

public struct Observation: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var doctorId: String
    public var reason: String
    public var questions: String
    public var stage: String
    public var stageHistory: [StageEntry]
    public var previousObservationId: String?
    public var archivedAt: String?
    public var createdAt: String
    public var updatedAt: String
    enum CodingKeys: String, CodingKey { case id, doctorId, reason, questions, stage, stageHistory, previousObservationId, archivedAt, createdAt, updatedAt }
    public func encode(to e: Encoder) throws {
        var c = e.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(doctorId, forKey: .doctorId); try c.encode(reason, forKey: .reason)
        try c.encode(questions, forKey: .questions); try c.encode(stage, forKey: .stage); try c.encode(stageHistory, forKey: .stageHistory)
        try c.encode(previousObservationId, forKey: .previousObservationId); try c.encode(archivedAt, forKey: .archivedAt)
        try c.encode(createdAt, forKey: .createdAt); try c.encode(updatedAt, forKey: .updatedAt)
    }
}

public struct Outcome: Codable, Equatable, Sendable {
    public var notes: String
    public var recommendations: String
    public var followUpDate: String?
    public var returnAdvice: String
    public var source: String
    enum CodingKeys: String, CodingKey { case notes, recommendations, followUpDate, returnAdvice, source }
    public func encode(to e: Encoder) throws {
        var c = e.container(keyedBy: CodingKeys.self)
        try c.encode(notes, forKey: .notes); try c.encode(recommendations, forKey: .recommendations)
        try c.encode(followUpDate, forKey: .followUpDate); try c.encode(returnAdvice, forKey: .returnAdvice); try c.encode(source, forKey: .source)
    }
}

public struct Visit: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var observationId: String
    public var date: String
    public var time: String?
    public var kind: String
    public var status: String
    public var previousVisitId: String?
    public var outcome: Outcome?
    public var createdAt: String
    public var updatedAt: String
    enum CodingKeys: String, CodingKey { case id, observationId, date, time, kind, status, previousVisitId, outcome, createdAt, updatedAt }
    public func encode(to e: Encoder) throws {
        var c = e.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(observationId, forKey: .observationId); try c.encode(date, forKey: .date)
        try c.encode(time, forKey: .time); try c.encode(kind, forKey: .kind); try c.encode(status, forKey: .status)
        try c.encode(previousVisitId, forKey: .previousVisitId); try c.encode(outcome, forKey: .outcome)
        try c.encode(createdAt, forKey: .createdAt); try c.encode(updatedAt, forKey: .updatedAt)
    }
}

public struct Prescription: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var visitId: String
    public var kind: String
    public var text: String
    public var dueDate: String?
    public var source: String
    public var createdAt: String
    public var updatedAt: String
    enum CodingKeys: String, CodingKey { case id, visitId, kind, text, dueDate, source, createdAt, updatedAt }
    public func encode(to e: Encoder) throws {
        var c = e.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(visitId, forKey: .visitId); try c.encode(kind, forKey: .kind); try c.encode(text, forKey: .text)
        try c.encode(dueDate, forKey: .dueDate); try c.encode(source, forKey: .source); try c.encode(createdAt, forKey: .createdAt); try c.encode(updatedAt, forKey: .updatedAt)
    }
}

public struct Course: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var observationId: String
    public var prescriptionId: String?
    public var name: String
    public var dose: String
    public var instructions: String
    public var startDate: String
    public var endDate: String?
    public var indefinite: Bool
    public var times: [String]
    public var days: [Int]
    public var stoppedAt: String?
    public var createdAt: String
    public var updatedAt: String
    enum CodingKeys: String, CodingKey { case id, observationId, prescriptionId, name, dose, instructions, startDate, endDate, indefinite, times, days, stoppedAt, createdAt, updatedAt }
    public func encode(to e: Encoder) throws {
        var c = e.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(observationId, forKey: .observationId); try c.encode(prescriptionId, forKey: .prescriptionId)
        try c.encode(name, forKey: .name); try c.encode(dose, forKey: .dose); try c.encode(instructions, forKey: .instructions)
        try c.encode(startDate, forKey: .startDate); try c.encode(endDate, forKey: .endDate); try c.encode(indefinite, forKey: .indefinite)
        try c.encode(times, forKey: .times); try c.encode(days, forKey: .days); try c.encode(stoppedAt, forKey: .stoppedAt)
        try c.encode(createdAt, forKey: .createdAt); try c.encode(updatedAt, forKey: .updatedAt)
    }
}

public struct DoseEvent: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var courseId: String
    public var scheduledDate: String
    public var scheduledTime: String
    public var status: String
    public var actualAt: String?
    public var snoozedUntil: String?
    public var createdAt: String
    public var updatedAt: String
    enum CodingKeys: String, CodingKey { case id, courseId, scheduledDate, scheduledTime, status, actualAt, snoozedUntil, createdAt, updatedAt }
    public func encode(to e: Encoder) throws {
        var c = e.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(courseId, forKey: .courseId); try c.encode(scheduledDate, forKey: .scheduledDate)
        try c.encode(scheduledTime, forKey: .scheduledTime); try c.encode(status, forKey: .status); try c.encode(actualAt, forKey: .actualAt)
        try c.encode(snoozedUntil, forKey: .snoozedUntil); try c.encode(createdAt, forKey: .createdAt); try c.encode(updatedAt, forKey: .updatedAt)
    }
}

public struct Entry: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var symptom: String
    public var customLabel: String
    public var occurredAt: String
    public var createdAt: String
    public var updatedAt: String
    public var note: String
    public var durationMinutes: Int?
    public var intensity: Int?
    public var count: Int?
    public var trigger: String
    public var observationIds: [String]
    enum CodingKeys: String, CodingKey { case id, symptom, customLabel, occurredAt, createdAt, updatedAt, note, durationMinutes, intensity, count, trigger, observationIds }
    public func encode(to e: Encoder) throws {
        var c = e.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(symptom, forKey: .symptom); try c.encode(customLabel, forKey: .customLabel)
        try c.encode(occurredAt, forKey: .occurredAt); try c.encode(createdAt, forKey: .createdAt); try c.encode(updatedAt, forKey: .updatedAt)
        try c.encode(note, forKey: .note); try c.encode(durationMinutes, forKey: .durationMinutes); try c.encode(intensity, forKey: .intensity)
        try c.encode(count, forKey: .count); try c.encode(trigger, forKey: .trigger); try c.encode(observationIds, forKey: .observationIds)
    }
}

public struct DailyRating: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var date: String
    public var symptom: String
    public var customLabel: String
    public var frequency: String
    public var note: String
    public var observationIds: [String]
    public var createdAt: String
    public var updatedAt: String
}

public struct Assessment: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var observationId: String
    public var date: String
    public var rating: String
    public var note: String
    public var createdAt: String
    public var updatedAt: String
}

public struct Attachment: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var visitId: String
    public var fileName: String
    public var mime: String
    public var size: Int
    public var sha256: String
    public var source: String
    public var note: String
    public var addedAt: String
}

public struct AppState: Codable, Equatable, Sendable {
    public var schemaVersion: Int = Schema.version
    public var settings = Settings()
    public var doctors: [Doctor] = []
    public var observations: [Observation] = []
    public var visits: [Visit] = []
    public var prescriptions: [Prescription] = []
    public var courses: [Course] = []
    public var doseEvents: [DoseEvent] = []
    public var entries: [Entry] = []
    public var dailyRatings: [DailyRating] = []
    public var assessments: [Assessment] = []
    public var attachments: [Attachment] = []
    public init() {}
}

extension Entry {
    /// Grouping key shared with JS `symptomKey`.
    public var symptomKey: String { symptom == "custom" ? "custom:" + customLabel.lowercased() : symptom }
}
extension DailyRating {
    public var symptomKey: String { symptom == "custom" ? "custom:" + customLabel.lowercased() : symptom }
}

public func doseId(_ courseId: String, _ date: String, _ time: String) -> String { "\(courseId)@\(date)T\(time)" }
