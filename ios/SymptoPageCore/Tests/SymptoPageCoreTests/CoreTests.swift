// Cross-platform contract tests. Fixtures are produced by the Windows/JS core
// (scripts/make-fixtures.mjs, make-backup-fixture.mjs, export-i18n.mjs) and
// copied here; tests/ios-fixtures.test.mjs fails if the copies drift.
import Foundation
import XCTest
@testable import SymptoPageCore

func fixture(_ name: String) throws -> Data {
    let url = Bundle.module.url(forResource: "Fixtures/" + name, withExtension: nil)!
    return try Data(contentsOf: url)
}
func ids(_ prefix: String = "t") -> () -> String { var n = 0; return { n += 1; return "\(prefix)-\(n)" } }
func json(_ d: Data) throws -> NSObject { try JSONSerialization.jsonObject(with: d) as! NSObject }

final class FormatTests: XCTestCase {
    func testWindowsV2FileRoundTripsUnchanged() throws {
        let original = try fixture("v2-sample.json")
        let (state, report) = try Migration.upgrade(original)
        XCTAssertNil(report)
        XCTAssertEqual(state.doctors.count, 2)
        XCTAssertEqual(state.entries.first { $0.symptom == "dizziness" }?.observationIds.count, 2)
        XCTAssertEqual(state.settings.language, "pl")
        let reencoded = try JSONEncoder().encode(state)
        XCTAssertEqual(try json(reencoded), try json(original), "iOS must write exactly the Windows format, including explicit nulls")
    }

    func testV040MigrationMatchesWindows() throws {
        let (s, report) = try Migration.upgrade(try fixture("v0.4.0-records.json"), now: Date(timeIntervalSince1970: 1_790_000_000), newId: ids("m"))
        XCTAssertEqual(report, MigrationReport(from: 1, to: 2, doctors: 1, observations: 1, visits: 1, entries: 2, dailyRatings: 1))
        XCTAssertEqual(s.settings.language, "pl")
        XCTAssertEqual(s.observations[0].id, "0d7c1f8e-1111-4c2a-9c55-000000000001")
        let e = s.entries.first { $0.id == "0d7c1f8e-2222-4c2a-9c55-000000000002" }!
        XCTAssertEqual(e.occurredAt, "2026-09-30T19:42:00.000Z")
        XCTAssertEqual(e.note, "TEST — zażółć gęślą jaźń")
        XCTAssertEqual(e.observationIds, [s.observations[0].id])
    }

    func testUnknownAndNewerFilesAreRefused() {
        XCTAssertThrowsError(try Migration.upgrade(Data(#"{"schemaVersion":99}"#.utf8))) { XCTAssertEqual(($0 as? DataError)?.code, "NEWER_SCHEMA") }
        XCTAssertThrowsError(try Migration.upgrade(Data(#"{"hello":1}"#.utf8))) { XCTAssertEqual(($0 as? DataError)?.code, "UNKNOWN_FORMAT") }
        XCTAssertThrowsError(try Migration.upgrade(Data("{broken".utf8)))
    }

    func testWindowsBackupImportsAndRepeatImportIsNoOp() throws {
        let (incoming, files) = try Backup.decode(try fixture("windows-backup.json"))
        XCTAssertEqual(files.count, 0)
        let (merged, r1) = try Backup.merge(AppState(), incoming)
        XCTAssertEqual(r1.added, incoming.doctors.count + incoming.observations.count + incoming.visits.count + incoming.prescriptions.count + incoming.courses.count + incoming.doseEvents.count + incoming.entries.count + incoming.dailyRatings.count + incoming.assessments.count)
        let (again, r2) = try Backup.merge(merged, incoming)
        XCTAssertEqual(r2.added, 0)
        XCTAssertEqual(again, merged)
        // iOS export can be read back (and by Windows: same envelope fields).
        let exported = try Backup.encode(merged, appVersion: "test")
        let obj = try JSONSerialization.jsonObject(with: exported) as! [String: Any]
        XCTAssertEqual(obj["format"] as? String, "symptopage-backup")
        XCTAssertEqual(obj["formatVersion"] as? Int, 1)
        XCTAssertEqual(try Backup.decode(exported).0, merged)
    }
}

final class CommandTests: XCTestCase {
    var ctx = CommandContext(now: ISO8601DateFormatter().date(from: "2026-10-03T10:00:00Z")!, newId: ids())

    func seed() throws -> (AppState, String, String) {
        let (s1, d1) = try Commands.saveDoctor(AppState(), specialty: "cardiologist", ctx: ctx)
        let (s2, d2) = try Commands.saveDoctor(s1, specialty: "other", specialtyCustom: "TEST", ctx: ctx)
        let (s3, o1) = try Commands.saveObservation(s2, doctorId: d1, reason: "TEST a", visitDate: "2026-11-19", ctx: ctx)
        let (s4, o2) = try Commands.saveObservation(s3, doctorId: d2, reason: "TEST b", visitDate: "2026-10-20", ctx: ctx)
        return (s4, o1, o2)
    }

    func testSharedEntryStoredOnceAndDoctorDeleteKeepsIt() throws {
        let (s0, o1, o2) = try seed()
        var (s, _) = try Commands.saveEntry(s0, symptom: "pain", occurredAt: "2026-10-02T08:00:00.000Z", observationIds: [o1, o2, o1], ctx: ctx)
        XCTAssertEqual(s.entries.count, 1)
        XCTAssertEqual(s.entries[0].observationIds, [o1, o2])
        s = try Commands.deleteDoctor(s, id: s.doctors[0].id)
        XCTAssertEqual(s.entries.count, 1)
        XCTAssertEqual(s.entries[0].observationIds, [o2])
    }

    func testInvalidInputLeavesStateUntouched() throws {
        let (s, _, _) = try seed()
        XCTAssertThrowsError(try Commands.saveEntry(s, symptom: "pain", occurredAt: "2027-01-01T00:00:00.000Z", ctx: ctx))
        XCTAssertThrowsError(try Commands.saveEntry(s, symptom: "pain", occurredAt: "2026-10-01T00:00:00.000Z", observationIds: ["nope"], ctx: ctx))
        XCTAssertThrowsError(try Commands.saveEntry(s, symptom: "custom", customLabel: " ", occurredAt: "2026-10-01T00:00:00.000Z", ctx: ctx))
        XCTAssertThrowsError(try Commands.saveDoctor(s, specialty: "fake", ctx: ctx))
    }

    func testDoseMarkIsIdempotentAndOutcomeMovesStage() throws {
        let (s0, o1, _) = try seed()
        var (s, c) = try Commands.saveCourse(s0, observationId: o1, name: "TEST", dose: "5 mg", startDate: "2026-10-01", endDate: nil, indefinite: true, times: ["20:00", "08:00"], days: [1, 2, 3, 4, 5, 6, 7], ctx: ctx)
        XCTAssertEqual(s.courses[0].times, ["08:00", "20:00"])
        s = try Commands.markDose(s, courseId: c, date: "2026-10-03", time: "08:00", status: "taken", ctx: ctx)
        s = try Commands.markDose(s, courseId: c, date: "2026-10-03", time: "08:00", status: "taken", ctx: ctx)
        XCTAssertEqual(s.doseEvents.count, 1)
        XCTAssertThrowsError(try Commands.markDose(s, courseId: c, date: "2026-10-03", time: "09:00", status: "taken", ctx: ctx))
        s = try Commands.saveOutcome(s, visitId: s.visits[0].id, notes: "TEST", recommendations: "", followUpDate: nil, returnAdvice: "", source: "user", ctx: ctx)
        XCTAssertEqual(s.observations.first { $0.id == o1 }?.stage, "visited")
        XCTAssertEqual(s.observations.first { $0.id == o1 }?.stageHistory.map(\.stage), ["waiting", "visited"])
    }

    func testDailyRatingUpsertsPerDayAndSymptom() throws {
        var (s, _, _) = try seed()
        s = try Commands.saveDaily(s, date: "2026-10-03", symptom: "custom", customLabel: "Tingling", frequency: "once", ctx: ctx)
        s = try Commands.saveDaily(s, date: "2026-10-03", symptom: "custom", customLabel: "tingling", frequency: "several", ctx: ctx)
        XCTAssertEqual(s.dailyRatings.count, 1)
        XCTAssertEqual(s.dailyRatings[0].frequency, "several")
    }
}

final class ScheduleTests: XCTestCase {
    func warsaw() -> Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "Europe/Warsaw")!; return c }

    func state(times: [String]) throws -> (AppState, String) {
        let ctx = CommandContext(now: ISO8601DateFormatter().date(from: "2026-10-01T00:00:00Z")!, newId: ids())
        let (s1, d) = try Commands.saveDoctor(AppState(), specialty: "gp", ctx: ctx)
        let (s2, o) = try Commands.saveObservation(s1, doctorId: d, reason: "TEST", ctx: ctx)
        let (s, c) = try Commands.saveCourse(s2, observationId: o, name: "TEST", dose: "1", startDate: "2026-10-24", endDate: nil, indefinite: true, times: times, days: [1, 2, 3, 4, 5, 6, 7], ctx: ctx)
        return (s, c)
    }

    func testAutumnDSTKeepsLocalTimeAndMatchesWindows() throws {
        let (s, _) = try state(times: ["02:30", "08:00"])
        let doses = Schedule.plannedDoses(s, from: "2026-10-24", to: "2026-10-26", calendar: warsaw())
        XCTAssertEqual(doses.count, 6)
        let d = doses.first { $0.date == "2026-10-25" && $0.time == "08:00" }!
        XCTAssertEqual(TimeUtil.iso(d.at), "2026-10-25T07:00:00.000Z")
    }

    func testSpringDSTGapMovesForwardLikeWindows() throws {
        let (s, _) = try state(times: ["02:30"])
        let d = Schedule.plannedDoses(s, from: "2027-03-28", to: "2027-03-28", calendar: warsaw())[0]
        XCTAssertEqual(TimeUtil.iso(d.at), "2027-03-28T01:30:00.000Z", "02:30 does not exist; 03:30 CEST = 01:30Z (same as JS)")
    }

    func testNotificationsHaveStableUniqueIdsAndSkipMarkedDoses() throws {
        var (s, c) = try state(times: ["08:00", "20:00"])
        let now = ISO8601DateFormatter().date(from: "2026-10-26T05:00:00Z")!
        let ctx = CommandContext(now: now, newId: ids("x"))
        s = try Commands.markDose(s, courseId: c, date: "2026-10-26", time: "08:00", status: "skipped", ctx: ctx)
        let plan = Schedule.notifications(s, now: now, days: 2, calendar: warsaw())
        XCTAssertEqual(Set(plan.map(\.identifier)).count, plan.count)
        XCTAssertFalse(plan.contains { $0.dose.date == "2026-10-26" && $0.dose.time == "08:00" })
        XCTAssertEqual(plan.first?.identifier, doseId(c, "2026-10-26", "20:00"))
        XCTAssertEqual(Schedule.notifications(s, now: now, days: 30, limit: 10, calendar: warsaw()).count, 10)
        s = try Commands.updateSettings(s, notificationsEnabled: false)
        XCTAssertTrue(Schedule.notifications(s, now: now, calendar: warsaw()).isEmpty)
    }
}

final class TranslatorTests: XCTestCase {
    func testPolishPluralsMatchWindows() throws {
        let t = try Translator(json: try fixture("i18n.json"), language: "pl")
        XCTAssertEqual(t.t("journal.count", ["n": 1]), "1 zdarzenie")
        XCTAssertEqual(t.t("journal.count", ["n": 3]), "3 zdarzenia")
        XCTAssertEqual(t.t("journal.count", ["n": 5]), "5 zdarzeń")
        XCTAssertEqual(t.t("journal.count", ["n": 22]), "22 zdarzenia")
        XCTAssertEqual(t.t("now.button"), "Teraz")
    }
    func testEveryKeyExistsInBothLanguages() throws {
        let t = try Translator(json: try fixture("i18n.json"), language: "en")
        XCTAssertGreaterThan(t.keys.count, 400)
        for k in t.keys { XCTAssertTrue(t.hasKey(k, language: "pl"), k) }
    }
}
