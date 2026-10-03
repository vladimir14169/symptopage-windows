// Calendar helpers — same rules as core/time.js. Days and wall-clock times are
// interpreted in the device's current time zone; instants are ISO-8601 strings.
import Foundation

public enum TimeUtil {
    static let posix = Locale(identifier: "en_US_POSIX")

    public static func isDay(_ s: String?) -> Bool {
        guard let s, s.count == 10, s.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return false }
        let p = s.split(separator: "-").compactMap { Int($0) }
        var utc = Calendar(identifier: .gregorian); utc.timeZone = TimeZone(identifier: "UTC")!
        guard let d = utc.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: 12)) else { return false }
        let back = utc.dateComponents([.year, .month, .day], from: d)
        return back.year == p[0] && back.month == p[1] && back.day == p[2]
    }

    public static func isTime(_ s: String?) -> Bool {
        guard let s else { return false }
        return s.range(of: #"^([01]\d|2[0-3]):[0-5]\d$"#, options: .regularExpression) != nil
    }

    public static func parseInstant(_ s: String?) -> Date? {
        guard let s, s.count <= 40 else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }
    public static func isInstant(_ s: String?) -> Bool { parseInstant(s) != nil }

    /// JS `Date.toISOString()` format: UTC with milliseconds.
    public static func iso(_ d: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: d)
    }

    public static func localDay(_ d: Date = Date(), calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    public static func addDays(_ day: String, _ n: Int) -> String {
        var utc = Calendar(identifier: .gregorian); utc.timeZone = TimeZone(identifier: "UTC")!
        let p = day.split(separator: "-").compactMap { Int($0) }
        let d = utc.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: 12))!
        return localDay(utc.date(byAdding: .day, value: n, to: d)!, calendar: utc)
    }

    /// ISO weekday: 1 = Monday … 7 = Sunday.
    public static func weekday(_ day: String) -> Int {
        var utc = Calendar(identifier: .gregorian); utc.timeZone = TimeZone(identifier: "UTC")!
        let p = day.split(separator: "-").compactMap { Int($0) }
        let d = utc.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: 12))!
        let w = utc.component(.weekday, from: d) // 1 = Sunday
        return w == 1 ? 7 : w - 1
    }

    /// Local wall-clock day + "HH:MM" → instant, with the same rules as the JS
    /// engine used on Windows: inside a DST gap the time moves forward by the gap
    /// (02:30 → 03:30); a repeated hour resolves to its first occurrence.
    public static func wallClock(_ day: String, _ time: String, calendar: Calendar = .current) -> Date {
        let p = day.split(separator: "-").compactMap { Int($0) }
        let t = time.split(separator: ":").compactMap { Int($0) }
        var utc = Calendar(identifier: .gregorian); utc.timeZone = TimeZone(identifier: "UTC")!
        let naive = utc.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: t[0], minute: t[1]))!
        let tz = calendar.timeZone
        let before = tz.secondsFromGMT(for: naive.addingTimeInterval(-3 * 3600))
        let after = tz.secondsFromGMT(for: naive.addingTimeInterval(3 * 3600))
        let matches = { (d: Date) -> Bool in
            let c = calendar.dateComponents(in: tz, from: d)
            return c.hour == t[0] && c.minute == t[1]
        }
        let candidates = [naive.addingTimeInterval(TimeInterval(-before)), naive.addingTimeInterval(TimeInterval(-after))].filter(matches)
        return candidates.min() ?? naive.addingTimeInterval(TimeInterval(-before))
    }
}
