// Planned doses and notification planning — rules as in core/schedule.js.
import Foundation

public struct PlannedDose: Equatable, Sendable {
    public var id: String
    public var courseId: String
    public var date: String
    public var time: String
    public var at: Date
    public var status: String // "pending" = not marked yet
    public var event: DoseEvent?
}

public struct PlannedNotification: Equatable, Sendable {
    public var identifier: String // stable: dose ID (+ snooze time) → re-scheduling replaces, never duplicates
    public var fireAt: Date
    public var dose: PlannedDose
}

public enum Schedule {
    public static func activeOn(_ c: Course, _ date: String, calendar: Calendar = .current) -> Bool {
        if let s = c.stoppedAt, let d = TimeUtil.parseInstant(s), date > TimeUtil.localDay(d, calendar: calendar) { return false }
        if date < c.startDate { return false }
        if !c.indefinite, let end = c.endDate, date > end { return false }
        return c.days.contains(TimeUtil.weekday(date))
    }

    public static func plannedDoses(_ s: AppState, from: String, to: String, calendar: Calendar = .current) -> [PlannedDose] {
        let events = Dictionary(uniqueKeysWithValues: s.doseEvents.map { ($0.id, $0) })
        var out: [PlannedDose] = []
        for c in s.courses {
            var d = from
            while d <= to {
                if activeOn(c, d, calendar: calendar) {
                    for t in c.times {
                        let id = doseId(c.id, d, t)
                        let e = events[id]
                        out.append(PlannedDose(id: id, courseId: c.id, date: d, time: t, at: TimeUtil.wallClock(d, t, calendar: calendar), status: e?.status ?? "pending", event: e))
                    }
                }
                d = TimeUtil.addDays(d, 1)
            }
        }
        return out.sorted { $0.at < $1.at }
    }

    /// Local notifications to have pending after a change. iOS keeps at most 64
    /// pending requests per app, so only the nearest `limit` are planned; the app
    /// re-plans on every launch, change and return to foreground.
    public static func notifications(_ s: AppState, now: Date, days: Int = 7, limit: Int = 60, calendar: Calendar = .current) -> [PlannedNotification] {
        guard s.settings.notificationsEnabled else { return [] }
        let today = TimeUtil.localDay(now, calendar: calendar)
        var out: [PlannedNotification] = []
        for dose in plannedDoses(s, from: today, to: TimeUtil.addDays(today, days), calendar: calendar) {
            switch dose.status {
            case "taken", "skipped": continue
            case "snoozed":
                if let until = TimeUtil.parseInstant(dose.event?.snoozedUntil), until > now {
                    out.append(PlannedNotification(identifier: dose.id + "#" + (dose.event?.snoozedUntil ?? ""), fireAt: until, dose: dose))
                }
            default:
                if dose.at > now { out.append(PlannedNotification(identifier: dose.id, fireAt: dose.at, dose: dose)) }
            }
        }
        return Array(out.sorted { $0.fireAt < $1.fireAt }.prefix(limit))
    }
}
