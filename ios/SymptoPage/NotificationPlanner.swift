// Local medication reminders on iOS.
// - Requests are identified by dose ID, so re-planning replaces instead of duplicating.
// - All pending SymptoPage requests are replaced by the new plan (changed or
//   deleted courses, marked doses, reminders switched off, new language).
// - iOS keeps at most 64 pending requests per app; the nearest 60 are planned and
//   the plan is refreshed on launch, every change and return to foreground.
// - Delivery is done by iOS even when the app is closed, but not when the phone is
//   off, and Focus/notification settings can silence it. A delivered reminder is
//   not a taken dose.
// - Default text contains no medication details (visible on the lock screen).
import Foundation
import SymptoPageCore
import UserNotifications

actor NotificationPlanner {
    static let prefix = "symptopage.dose."

    func requestAuthorization() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    func authorizationStatus() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    func replan(_ state: AppState, translator: Translator, now: Date = Date()) async {
        let center = UNUserNotificationCenter.current()
        let plan = Schedule.notifications(state, now: now)
        // Remove every pending SymptoPage request, then add the current plan.
        // Identifiers are stable dose IDs, so this never leaves duplicates and
        // also refreshes texts after a language or privacy-setting change.
        let pending = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(Self.prefix) }
        center.removePendingNotificationRequests(withIdentifiers: pending)
        let status = await authorizationStatus()
        guard status == .authorized || status == .provisional else { return }
        for item in plan {
            let content = UNMutableNotificationContent()
            content.title = translator.t("reminder.title")
            if state.settings.notificationDetails, let c = state.courses.first(where: { $0.id == item.dose.courseId }) {
                content.body = translator.t("reminder.detailed", ["time": item.dose.time, "name": c.name, "dose": c.dose])
            } else {
                content.body = translator.t("reminder.generic")
            }
            content.sound = .default
            content.threadIdentifier = "symptopage.doses"
            let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: item.fireAt)
            let request = UNNotificationRequest(identifier: Self.prefix + item.identifier, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false))
            try? await center.add(request)
        }
    }
}
