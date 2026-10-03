// Whole-state validation — port of core/validate.js. Errors carry only a
// structural code (never user text), so they are safe to show and log.
import Foundation

public struct DataError: Error, Equatable, CustomStringConvertible {
    public let code: String
    public init(_ code: String) { self.code = code }
    public var description: String { "INVALID_DATA(\(code))" }
}

func check(_ ok: Bool, _ code: String) throws { if !ok { throw DataError(code) } }
func text(_ s: String, _ code: String, max: Int = Schema.maxText) throws -> String {
    try check(s.utf16.count <= max, code); return s.trimmingCharacters(in: .whitespacesAndNewlines)
}
func required(_ s: String, _ code: String, max: Int = Schema.maxText) throws -> String {
    let v = try text(s, code, max: max); try check(!v.isEmpty, code); return v
}
func validId(_ s: String) -> Bool { s.range(of: #"^[\w@:./\-]{1,120}$"#, options: .regularExpression) != nil }

public enum Validator {
    static func unique(_ ids: [String], _ code: String) throws -> Set<String> {
        var set = Set<String>()
        for id in ids {
            try check(validId(id), code)
            try check(!set.contains(id), code + "_DUPLICATE")
            set.insert(id)
        }
        return set
    }
    static func stamps(_ a: String, _ b: String, _ code: String) throws {
        try check(TimeUtil.isInstant(a) && TimeUtil.isInstant(b), code)
    }

    @discardableResult
    public static func validate(_ s: AppState) throws -> AppState {
        try check(s.schemaVersion == Schema.version, "SCHEMA_VERSION")
        try check(Schema.languages.contains(s.settings.language), "LANGUAGE")
        if let c = s.settings.country { try check(Schema.countries.contains(c), "COUNTRY") }

        let doctors = try unique(s.doctors.map(\.id), "DOCTOR")
        for d in s.doctors {
            try check(Schema.specialties.contains(d.specialty), "DOCTOR_SPECIALTY")
            _ = try text(d.specialtyCustom, "DOCTOR", max: 120)
            if d.specialty == "other" { try check(!d.specialtyCustom.trimmingCharacters(in: .whitespaces).isEmpty, "DOCTOR_SPECIALTY") }
            _ = try text(d.name, "DOCTOR", max: 200); _ = try text(d.clinic, "DOCTOR", max: 200); _ = try text(d.note, "DOCTOR")
            if let a = d.archivedAt { try check(TimeUtil.isInstant(a), "DOCTOR") }
            try stamps(d.createdAt, d.updatedAt, "DOCTOR")
        }

        let observations = try unique(s.observations.map(\.id), "OBSERVATION")
        for o in s.observations {
            try check(doctors.contains(o.doctorId), "OBSERVATION_DOCTOR")
            _ = try required(o.reason, "OBSERVATION_REASON"); _ = try text(o.questions, "OBSERVATION")
            try check(Schema.stages.contains(o.stage), "OBSERVATION_STAGE")
            try check(!o.stageHistory.isEmpty && o.stageHistory.allSatisfy { Schema.stages.contains($0.stage) && TimeUtil.isInstant($0.at) }, "OBSERVATION_STAGE")
            try check(o.stageHistory.last!.stage == o.stage, "OBSERVATION_STAGE")
            if let p = o.previousObservationId { try check(observations.contains(p) && p != o.id, "OBSERVATION_PREVIOUS") }
            if let a = o.archivedAt { try check(TimeUtil.isInstant(a), "OBSERVATION") }
            try stamps(o.createdAt, o.updatedAt, "OBSERVATION")
        }

        let visits = try unique(s.visits.map(\.id), "VISIT")
        for v in s.visits {
            try check(observations.contains(v.observationId), "VISIT_OBSERVATION")
            try check(TimeUtil.isDay(v.date), "VISIT_DATE")
            if let t = v.time { try check(TimeUtil.isTime(t), "VISIT_TIME") }
            try check(Schema.visitKinds.contains(v.kind), "VISIT_KIND")
            try check(Schema.visitStatuses.contains(v.status), "VISIT_STATUS")
            if let p = v.previousVisitId { try check(visits.contains(p) && p != v.id, "VISIT_PREVIOUS") }
            if let o = v.outcome {
                _ = try text(o.notes, "VISIT_OUTCOME"); _ = try text(o.recommendations, "VISIT_OUTCOME"); _ = try text(o.returnAdvice, "VISIT_OUTCOME")
                if let f = o.followUpDate { try check(TimeUtil.isDay(f), "VISIT_OUTCOME") }
                try check(Schema.sources.contains(o.source), "VISIT_OUTCOME")
            }
            try stamps(v.createdAt, v.updatedAt, "VISIT")
        }

        let prescriptions = try unique(s.prescriptions.map(\.id), "PRESCRIPTION")
        for p in s.prescriptions {
            try check(visits.contains(p.visitId), "PRESCRIPTION_VISIT")
            try check(Schema.prescriptionKinds.contains(p.kind), "PRESCRIPTION_KIND")
            _ = try required(p.text, "PRESCRIPTION_TEXT")
            if let d = p.dueDate { try check(TimeUtil.isDay(d), "PRESCRIPTION_DUE") }
            try check(Schema.sources.contains(p.source), "PRESCRIPTION_SOURCE")
            try stamps(p.createdAt, p.updatedAt, "PRESCRIPTION")
        }

        let courses = try unique(s.courses.map(\.id), "COURSE")
        for c in s.courses {
            try check(observations.contains(c.observationId), "COURSE_OBSERVATION")
            if let p = c.prescriptionId { try check(prescriptions.contains(p), "COURSE_PRESCRIPTION") }
            _ = try required(c.name, "COURSE_NAME", max: 200); _ = try required(c.dose, "COURSE_DOSE", max: 200); _ = try text(c.instructions, "COURSE")
            try check(TimeUtil.isDay(c.startDate), "COURSE_START")
            if c.indefinite { try check(c.endDate == nil, "COURSE_END") }
            else { try check(TimeUtil.isDay(c.endDate) && c.endDate! >= c.startDate, "COURSE_END") }
            try check(!c.times.isEmpty && c.times.count <= 12 && c.times.allSatisfy { TimeUtil.isTime($0) } && Set(c.times).count == c.times.count, "COURSE_TIMES")
            try check(!c.days.isEmpty && c.days.allSatisfy { (1...7).contains($0) } && Set(c.days).count == c.days.count, "COURSE_DAYS")
            if let st = c.stoppedAt { try check(TimeUtil.isInstant(st), "COURSE") }
            try stamps(c.createdAt, c.updatedAt, "COURSE")
        }

        _ = try unique(s.doseEvents.map(\.id), "DOSE")
        for e in s.doseEvents {
            try check(courses.contains(e.courseId), "DOSE_COURSE")
            try check(TimeUtil.isDay(e.scheduledDate), "DOSE_DATE")
            try check(TimeUtil.isTime(e.scheduledTime), "DOSE_TIME")
            try check(e.id == doseId(e.courseId, e.scheduledDate, e.scheduledTime), "DOSE_ID")
            try check(Schema.doseStatuses.contains(e.status), "DOSE_STATUS")
            if e.status == "taken" { try check(TimeUtil.isInstant(e.actualAt), "DOSE_ACTUAL") } else { try check(e.actualAt == nil, "DOSE_ACTUAL") }
            if e.status == "snoozed" { try check(TimeUtil.isInstant(e.snoozedUntil), "DOSE_SNOOZE") } else { try check(e.snoozedUntil == nil, "DOSE_SNOOZE") }
            try stamps(e.createdAt, e.updatedAt, "DOSE")
        }

        func links(_ ids: [String], _ code: String) throws {
            try check(Set(ids).count == ids.count && ids.allSatisfy { observations.contains($0) }, code)
        }
        _ = try unique(s.entries.map(\.id), "ENTRY")
        for e in s.entries {
            try check(Schema.symptoms.contains(e.symptom), "ENTRY_SYMPTOM")
            _ = try text(e.customLabel, "ENTRY", max: 120)
            try check((e.symptom == "custom") == !e.customLabel.isEmpty, "ENTRY_SYMPTOM")
            try check(TimeUtil.isInstant(e.occurredAt), "ENTRY_TIME")
            try stamps(e.createdAt, e.updatedAt, "ENTRY")
            _ = try text(e.note, "ENTRY"); _ = try text(e.trigger, "ENTRY", max: 1000)
            if let d = e.durationMinutes { try check((1...20160).contains(d), "ENTRY_DURATION") }
            if let i = e.intensity { try check(Schema.intensities.contains(i), "ENTRY_INTENSITY") }
            if let n = e.count { try check((1...1000).contains(n), "ENTRY_COUNT") }
            try links(e.observationIds, "ENTRY_LINKS")
        }

        _ = try unique(s.dailyRatings.map(\.id), "DAILY")
        var dailyKeys = Set<String>()
        for r in s.dailyRatings {
            try check(TimeUtil.isDay(r.date), "DAILY_DATE")
            try check(Schema.symptoms.contains(r.symptom), "DAILY_SYMPTOM")
            try check((r.symptom == "custom") == !r.customLabel.isEmpty, "DAILY_SYMPTOM")
            try check(Schema.frequencies.contains(r.frequency), "DAILY_FREQUENCY")
            _ = try text(r.note, "DAILY")
            try links(r.observationIds, "DAILY_LINKS")
            let key = r.date + "/" + r.symptomKey
            try check(!dailyKeys.contains(key), "DAILY_DUPLICATE"); dailyKeys.insert(key)
            try stamps(r.createdAt, r.updatedAt, "DAILY")
        }

        _ = try unique(s.assessments.map(\.id), "ASSESSMENT")
        var assessmentKeys = Set<String>()
        for a in s.assessments {
            try check(observations.contains(a.observationId), "ASSESSMENT_OBSERVATION")
            try check(TimeUtil.isDay(a.date), "ASSESSMENT_DATE")
            try check(Schema.ratings.contains(a.rating), "ASSESSMENT_RATING")
            _ = try text(a.note, "ASSESSMENT")
            let key = a.observationId + "/" + a.date
            try check(!assessmentKeys.contains(key), "ASSESSMENT_DUPLICATE"); assessmentKeys.insert(key)
            try stamps(a.createdAt, a.updatedAt, "ASSESSMENT")
        }

        _ = try unique(s.attachments.map(\.id), "ATTACHMENT")
        for a in s.attachments {
            try check(visits.contains(a.visitId), "ATTACHMENT_VISIT")
            _ = try required(a.fileName, "ATTACHMENT_NAME", max: 255)
            try check(Schema.attachmentTypes[a.mime] != nil, "ATTACHMENT_TYPE")
            try check(a.size >= 0, "ATTACHMENT_SIZE")
            try check(a.sha256.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil, "ATTACHMENT_HASH")
            try check(Schema.sources.contains(a.source), "ATTACHMENT_SOURCE")
            try check(TimeUtil.isInstant(a.addedAt), "ATTACHMENT")
        }
        return s
    }
}
