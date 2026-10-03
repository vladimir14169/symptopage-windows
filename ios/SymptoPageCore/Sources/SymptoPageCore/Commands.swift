// Data changes — port of core/commands.js (the subset used by the iOS client;
// see docs/FEATURE_STATUS.md). Each command works on a copy and validates the
// whole result; on error the caller keeps its previous state.
import Foundation

public struct CommandContext {
    public var now: Date
    public var newId: () -> String
    public init(now: Date = Date(), newId: @escaping () -> String = { UUID().uuidString.lowercased() }) {
        self.now = now; self.newId = newId
    }
    var at: String { TimeUtil.iso(now) }
}

public enum Commands {
    static func idx<T: Identifiable>(_ list: [T], _ id: String?, _ code: String) throws -> Int where T.ID == String {
        guard let id, let i = list.firstIndex(where: { $0.id == id }) else { throw DataError(code) }
        return i
    }
    static func links(_ s: AppState, _ ids: [String]) throws -> [String] {
        var out: [String] = []
        for id in ids where !out.contains(id) {
            try check(s.observations.contains { $0.id == id }, "LINKS"); out.append(id)
        }
        return out
    }
    static func commit(_ s: AppState) throws -> AppState { try Validator.validate(s) }

    // MARK: settings
    public static func updateSettings(_ s0: AppState, language: String? = nil, notificationsEnabled: Bool? = nil, notificationDetails: Bool? = nil, country: String?? = nil) throws -> AppState {
        var s = s0
        if let language { try check(Schema.languages.contains(language), "LANGUAGE"); s.settings.language = language }
        if let notificationsEnabled { s.settings.notificationsEnabled = notificationsEnabled }
        if let notificationDetails { s.settings.notificationDetails = notificationDetails }
        if let country { s.settings.country = country }
        return try commit(s)
    }

    // MARK: doctors
    public static func saveDoctor(_ s0: AppState, id: String? = nil, specialty: String, specialtyCustom: String = "", name: String = "", clinic: String = "", note: String = "", ctx: CommandContext) throws -> (AppState, String) {
        var s = s0
        try check(Schema.specialties.contains(specialty), "DOCTOR_SPECIALTY")
        let old = try id.map { s.doctors[try idx(s.doctors, $0, "DOCTOR")] }
        let custom = try (specialty == "other" ? required(specialtyCustom, "DOCTOR_SPECIALTY", max: 120) : "")
        let d = Doctor(id: old?.id ?? ctx.newId(), specialty: specialty,
                       specialtyCustom: custom,
                       name: try text(name, "DOCTOR", max: 200), clinic: try text(clinic, "DOCTOR", max: 200), note: try text(note, "DOCTOR"),
                       archivedAt: old?.archivedAt, createdAt: old?.createdAt ?? ctx.at, updatedAt: ctx.at)
        if let i = s.doctors.firstIndex(where: { $0.id == d.id }) { s.doctors[i] = d } else { s.doctors.append(d) }
        return (try commit(s), d.id)
    }
    public static func archiveDoctor(_ s0: AppState, id: String, archived: Bool, ctx: CommandContext) throws -> AppState {
        var s = s0; let i = try idx(s.doctors, id, "DOCTOR")
        s.doctors[i].archivedAt = archived ? (s.doctors[i].archivedAt ?? ctx.at) : nil
        s.doctors[i].updatedAt = ctx.at
        return try commit(s)
    }
    /// Deletes a doctor with observations, visits, courses…; symptom records are only unlinked.
    public static func deleteDoctor(_ s0: AppState, id: String) throws -> AppState {
        var s = s0; _ = try idx(s.doctors, id, "DOCTOR")
        let obs = Set(s.observations.filter { $0.doctorId == id }.map(\.id))
        let visits = Set(s.visits.filter { obs.contains($0.observationId) }.map(\.id))
        let courses = Set(s.courses.filter { obs.contains($0.observationId) }.map(\.id))
        s.observations = s.observations.filter { !obs.contains($0.id) }.map { var o = $0; if let p = o.previousObservationId, obs.contains(p) { o.previousObservationId = nil }; return o }
        s.visits.removeAll { visits.contains($0.id) }
        s.prescriptions.removeAll { visits.contains($0.visitId) }
        s.attachments.removeAll { visits.contains($0.visitId) }
        s.courses.removeAll { courses.contains($0.id) }
        s.doseEvents.removeAll { courses.contains($0.courseId) }
        s.assessments.removeAll { obs.contains($0.observationId) }
        s.entries = s.entries.map { var e = $0; e.observationIds.removeAll { obs.contains($0) }; return e }
        s.dailyRatings = s.dailyRatings.map { var r = $0; r.observationIds.removeAll { obs.contains($0) }; return r }
        s.doctors.removeAll { $0.id == id }
        return try commit(s)
    }

    // MARK: observations & visits
    public static func saveObservation(_ s0: AppState, id: String? = nil, doctorId: String, reason: String, questions: String = "", visitDate: String? = nil, visitTime: String? = nil, previousObservationId: String? = nil, ctx: CommandContext) throws -> (AppState, String) {
        var s = s0
        _ = try idx(s.doctors, doctorId, "OBSERVATION_DOCTOR")
        let old = try id.map { s.observations[try idx(s.observations, $0, "OBSERVATION")] }
        let o = ObservationPeriod(id: old?.id ?? ctx.newId(), doctorId: doctorId, reason: try required(reason, "OBSERVATION_REASON"), questions: try text(questions, "OBSERVATION"),
                            stage: old?.stage ?? "waiting", stageHistory: old?.stageHistory ?? [StageEntry(stage: "waiting", at: ctx.at)],
                            previousObservationId: previousObservationId ?? old?.previousObservationId, archivedAt: old?.archivedAt,
                            createdAt: old?.createdAt ?? ctx.at, updatedAt: ctx.at)
        if let i = s.observations.firstIndex(where: { $0.id == o.id }) { s.observations[i] = o } else { s.observations.append(o) }
        if old == nil, let visitDate {
            try check(TimeUtil.isDay(visitDate), "VISIT_DATE")
            if let visitTime { try check(TimeUtil.isTime(visitTime), "VISIT_TIME") }
            s.visits.append(Visit(id: ctx.newId(), observationId: o.id, date: visitDate, time: visitTime, kind: o.previousObservationId == nil ? "initial" : "followup", status: "planned", previousVisitId: nil, outcome: nil, createdAt: ctx.at, updatedAt: ctx.at))
        }
        return (try commit(s), o.id)
    }
    public static func setStage(_ s0: AppState, id: String, stage: String, ctx: CommandContext) throws -> AppState {
        var s = s0; let i = try idx(s.observations, id, "OBSERVATION")
        try check(Schema.stages.contains(stage), "OBSERVATION_STAGE")
        if s.observations[i].stage != stage {
            s.observations[i].stage = stage
            s.observations[i].stageHistory = Array((s.observations[i].stageHistory + [StageEntry(stage: stage, at: ctx.at)]).suffix(100))
            s.observations[i].updatedAt = ctx.at
        }
        return try commit(s)
    }
    public static func archiveObservation(_ s0: AppState, id: String, archived: Bool, ctx: CommandContext) throws -> AppState {
        var s = s0; let i = try idx(s.observations, id, "OBSERVATION")
        s.observations[i].archivedAt = archived ? (s.observations[i].archivedAt ?? ctx.at) : nil
        s.observations[i].updatedAt = ctx.at
        return try commit(s)
    }
    public static func saveVisit(_ s0: AppState, id: String? = nil, observationId: String, date: String, time: String? = nil, status: String? = nil, previousVisitId: String? = nil, ctx: CommandContext) throws -> (AppState, String) {
        var s = s0
        _ = try idx(s.observations, observationId, "VISIT_OBSERVATION")
        let old = try id.map { s.visits[try idx(s.visits, $0, "VISIT")] }
        if let previousVisitId { _ = try idx(s.visits, previousVisitId, "VISIT_PREVIOUS") }
        let prev = previousVisitId ?? old?.previousVisitId
        try check(TimeUtil.isDay(date), "VISIT_DATE")
        if let time { try check(TimeUtil.isTime(time), "VISIT_TIME") }
        let v = Visit(id: old?.id ?? ctx.newId(), observationId: observationId, date: date, time: time, kind: old?.kind ?? (prev == nil ? "initial" : "followup"),
                      status: status ?? old?.status ?? "planned", previousVisitId: prev, outcome: old?.outcome, createdAt: old?.createdAt ?? ctx.at, updatedAt: ctx.at)
        if let i = s.visits.firstIndex(where: { $0.id == v.id }) { s.visits[i] = v } else { s.visits.append(v) }
        return (try commit(s), v.id)
    }
    public static func saveOutcome(_ s0: AppState, visitId: String, notes: String, recommendations: String, followUpDate: String?, returnAdvice: String, source: String, ctx: CommandContext) throws -> AppState {
        var s = s0; let i = try idx(s.visits, visitId, "VISIT")
        if let followUpDate { try check(TimeUtil.isDay(followUpDate), "VISIT_OUTCOME") }
        try check(Schema.sources.contains(source), "VISIT_OUTCOME")
        s.visits[i].outcome = Outcome(notes: try text(notes, "VISIT_OUTCOME"), recommendations: try text(recommendations, "VISIT_OUTCOME"), followUpDate: followUpDate, returnAdvice: try text(returnAdvice, "VISIT_OUTCOME"), source: source)
        s.visits[i].status = "done"; s.visits[i].updatedAt = ctx.at
        if let o = s.observations.firstIndex(where: { $0.id == s.visits[i].observationId }), s.observations[o].stage == "waiting" {
            s.observations[o].stage = "visited"
            s.observations[o].stageHistory.append(StageEntry(stage: "visited", at: ctx.at))
            s.observations[o].updatedAt = ctx.at
        }
        return try commit(s)
    }
    public static func savePrescription(_ s0: AppState, id: String? = nil, visitId: String, kind: String, text body: String, dueDate: String? = nil, source: String = "user", ctx: CommandContext) throws -> (AppState, String) {
        var s = s0
        _ = try idx(s.visits, visitId, "PRESCRIPTION_VISIT")
        let old = try id.map { s.prescriptions[try idx(s.prescriptions, $0, "PRESCRIPTION")] }
        try check(Schema.prescriptionKinds.contains(kind), "PRESCRIPTION_KIND"); try check(Schema.sources.contains(source), "PRESCRIPTION_SOURCE")
        if let dueDate { try check(TimeUtil.isDay(dueDate), "PRESCRIPTION_DUE") }
        let p = Prescription(id: old?.id ?? ctx.newId(), visitId: visitId, kind: kind, text: try required(body, "PRESCRIPTION_TEXT"), dueDate: dueDate, source: source, createdAt: old?.createdAt ?? ctx.at, updatedAt: ctx.at)
        if let i = s.prescriptions.firstIndex(where: { $0.id == p.id }) { s.prescriptions[i] = p } else { s.prescriptions.append(p) }
        return (try commit(s), p.id)
    }

    // MARK: medication
    public static func saveCourse(_ s0: AppState, id: String? = nil, observationId: String, prescriptionId: String? = nil, name: String, dose: String, instructions: String = "", startDate: String, endDate: String?, indefinite: Bool, times: [String], days: [Int], ctx: CommandContext) throws -> (AppState, String) {
        var s = s0
        _ = try idx(s.observations, observationId, "COURSE_OBSERVATION")
        let old = try id.map { s.courses[try idx(s.courses, $0, "COURSE")] }
        let c = Course(id: old?.id ?? ctx.newId(), observationId: observationId, prescriptionId: prescriptionId ?? old?.prescriptionId,
                       name: try required(name, "COURSE_NAME", max: 200), dose: try required(dose, "COURSE_DOSE", max: 200), instructions: try text(instructions, "COURSE"),
                       startDate: startDate, endDate: indefinite ? nil : endDate, indefinite: indefinite,
                       times: Array(Set(times)).sorted(), days: Array(Set(days)).sorted(), stoppedAt: old?.stoppedAt, createdAt: old?.createdAt ?? ctx.at, updatedAt: ctx.at)
        if let i = s.courses.firstIndex(where: { $0.id == c.id }) { s.courses[i] = c } else { s.courses.append(c) }
        return (try commit(s), c.id)
    }
    public static func stopCourse(_ s0: AppState, id: String, stopped: Bool, ctx: CommandContext) throws -> AppState {
        var s = s0; let i = try idx(s.courses, id, "COURSE")
        s.courses[i].stoppedAt = stopped ? (s.courses[i].stoppedAt ?? ctx.at) : nil
        s.courses[i].updatedAt = ctx.at
        return try commit(s)
    }
    /// Idempotent: the ID is course + planned date/time, so repeated taps update one record.
    public static func markDose(_ s0: AppState, courseId: String, date: String, time: String, status: String, actualAt: String? = nil, snoozeMinutes: Int? = nil, ctx: CommandContext) throws -> AppState {
        var s = s0; let c = s.courses[try idx(s.courses, courseId, "DOSE_COURSE")]
        try check(TimeUtil.isDay(date), "DOSE_DATE"); try check(c.times.contains(time), "DOSE_TIME")
        try check(Schema.doseStatuses.contains(status), "DOSE_STATUS")
        let key = doseId(courseId, date, time)
        let old = s.doseEvents.first { $0.id == key }
        var actual: String? = nil, snoozed: String? = nil
        if status == "taken" {
            actual = actualAt ?? ctx.at
            try check((TimeUtil.parseInstant(actual)?.timeIntervalSince(ctx.now) ?? 1e9) <= 60, "DOSE_ACTUAL")
        }
        if status == "snoozed" {
            guard let m = snoozeMinutes, (5...240).contains(m) else { throw DataError("DOSE_SNOOZE") }
            snoozed = TimeUtil.iso(ctx.now.addingTimeInterval(Double(m) * 60))
        }
        let e = DoseEvent(id: key, courseId: courseId, scheduledDate: date, scheduledTime: time, status: status, actualAt: actual, snoozedUntil: snoozed, createdAt: old?.createdAt ?? ctx.at, updatedAt: ctx.at)
        if let i = s.doseEvents.firstIndex(where: { $0.id == key }) { s.doseEvents[i] = e } else { s.doseEvents.append(e) }
        return try commit(s)
    }
    public static func clearDose(_ s0: AppState, id: String) throws -> AppState {
        var s = s0; _ = try idx(s.doseEvents, id, "DOSE"); s.doseEvents.removeAll { $0.id == id }; return try commit(s)
    }

    // MARK: journal
    public static func saveEntry(_ s0: AppState, id: String? = nil, symptom: String, customLabel: String = "", occurredAt: String, note: String = "", durationMinutes: Int? = nil, intensity: Int? = nil, count: Int? = nil, trigger: String = "", observationIds: [String] = [], ctx: CommandContext) throws -> (AppState, String) {
        var s = s0
        try check(Schema.symptoms.contains(symptom), "SYMPTOM")
        let old = try id.map { s.entries[try idx(s.entries, $0, "ENTRY")] }
        guard let when = TimeUtil.parseInstant(occurredAt), when.timeIntervalSince(ctx.now) <= 60 else { throw DataError("ENTRY_TIME") }
        let label = try (symptom == "custom" ? required(customLabel, "SYMPTOM", max: 120) : "")
        let e = Entry(id: old?.id ?? ctx.newId(), symptom: symptom, customLabel: label,
                      occurredAt: occurredAt, createdAt: old?.createdAt ?? ctx.at, updatedAt: ctx.at, note: try text(note, "ENTRY"),
                      durationMinutes: durationMinutes, intensity: intensity, count: count, trigger: try text(trigger, "ENTRY", max: 1000),
                      observationIds: try links(s, observationIds))
        if let i = s.entries.firstIndex(where: { $0.id == e.id }) { s.entries[i] = e } else { s.entries.append(e) }
        s.entries.sort { $0.occurredAt > $1.occurredAt }
        return (try commit(s), e.id)
    }
    public static func deleteEntry(_ s0: AppState, id: String) throws -> AppState {
        var s = s0; _ = try idx(s.entries, id, "ENTRY"); s.entries.removeAll { $0.id == id }; return try commit(s)
    }
    public static func saveDaily(_ s0: AppState, date: String, symptom: String, customLabel: String = "", frequency: String, note: String = "", observationIds: [String]? = nil, ctx: CommandContext) throws -> AppState {
        var s = s0
        try check(TimeUtil.isDay(date), "DAILY_DATE"); try check(Schema.symptoms.contains(symptom), "SYMPTOM"); try check(Schema.frequencies.contains(frequency), "DAILY_FREQUENCY")
        let label = try (symptom == "custom" ? required(customLabel, "SYMPTOM", max: 120) : "")
        let key = symptom == "custom" ? "custom:" + label.lowercased() : symptom
        let old = s.dailyRatings.first { $0.date == date && $0.symptomKey == key }
        let r = DailyRating(id: old?.id ?? ctx.newId(), date: date, symptom: symptom, customLabel: label, frequency: frequency, note: try text(note, "DAILY"),
                            observationIds: try links(s, observationIds ?? old?.observationIds ?? []), createdAt: old?.createdAt ?? ctx.at, updatedAt: ctx.at)
        if let i = s.dailyRatings.firstIndex(where: { $0.id == r.id }) { s.dailyRatings[i] = r } else { s.dailyRatings.append(r) }
        s.dailyRatings.sort { $0.date > $1.date }
        return try commit(s)
    }
    public static func saveAssessment(_ s0: AppState, observationId: String, date: String, rating: String, note: String = "", ctx: CommandContext) throws -> AppState {
        var s = s0
        _ = try idx(s.observations, observationId, "ASSESSMENT_OBSERVATION")
        try check(TimeUtil.isDay(date), "ASSESSMENT_DATE"); try check(Schema.ratings.contains(rating), "ASSESSMENT_RATING")
        let old = s.assessments.first { $0.observationId == observationId && $0.date == date }
        let a = Assessment(id: old?.id ?? ctx.newId(), observationId: observationId, date: date, rating: rating, note: try text(note, "ASSESSMENT"), createdAt: old?.createdAt ?? ctx.at, updatedAt: ctx.at)
        if let i = s.assessments.firstIndex(where: { $0.id == a.id }) { s.assessments[i] = a } else { s.assessments.append(a) }
        s.assessments.sort { $0.date > $1.date }
        return try commit(s)
    }
}
