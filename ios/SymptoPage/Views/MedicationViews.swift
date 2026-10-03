import SwiftUI
import SymptoPageCore

struct MedicationsView: View {
    @Environment(AppModel.self) private var model
    @State private var adding = false
    @State private var editing: Course?

    var body: some View {
        let s = model.state!
        let obs = Set(model.visibleObservations.map(\.id))
        let courses = s.courses.filter { obs.contains($0.observationId) }
        let today = TimeUtil.localDay()
        let doses = Schedule.plannedDoses(AppState.with(s, courses: courses), from: today, to: today)
        List {
            Section { Text(model.t("med.notice")).font(.footnote) }
            Section { DoctorFilter() }
            Section(model.t("med.today")) {
                if doses.isEmpty { Text(model.t("med.noneToday")).foregroundStyle(.secondary) }
                ForEach(doses, id: \.id) { d in
                    let c = courses.first { $0.id == d.courseId }!
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(d.time) · \(c.name) — \(c.dose)").font(.headline)
                        Text(status(d)).font(.subheadline).foregroundStyle(d.status == "taken" ? .green : .secondary)
                        HStack {
                            Button(model.t("dose.taken")) { mark(d, "taken") }.buttonStyle(.borderedProminent)
                            Button(model.t("dose.skipped")) { mark(d, "skipped") }.buttonStyle(.bordered)
                            Menu(model.t("dose.snooze")) {
                                ForEach([10, 30, 60], id: \.self) { m in Button(model.t("unit.minutes", ["n": m])) { mark(d, "snoozed", snooze: m) } }
                            }
                            if d.status != "pending" { Button(model.t("dose.clear")) { model.change { s, _ in try Commands.clearDose(s, id: d.id) } } }
                        }
                    }
                }
            }
            Section(model.t("med.courses")) {
                ForEach(courses) { c in
                    Button { editing = c } label: {
                        VStack(alignment: .leading) {
                            Text("\(c.name) — \(c.dose)").font(.headline)
                            Text("\(c.startDate) – \(c.indefinite ? model.t("course.noEnd") : c.endDate ?? "") · \(c.times.joined(separator: ", "))").font(.footnote)
                        }
                    }
                    .foregroundStyle(Theme.ink)
                    .swipeActions {
                        Button(c.stoppedAt == nil ? model.t("course.stop") : model.t("course.resume")) {
                            model.change { try Commands.stopCourse($0, id: c.id, stopped: c.stoppedAt == nil, ctx: $1) }
                        }
                    }
                }
                Text(model.t("course.endNotRecovery")).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle(model.t("nav.medications"))
        .toolbar {
            if let first = model.visibleObservations.first {
                Button { adding = true } label: { Label(model.t("course.add"), systemImage: "plus") }
                    .sheet(isPresented: $adding) { CourseForm(course: nil, observationId: first.id, prescriptionId: nil) }
            }
        }
        .sheet(item: $editing) { CourseForm(course: $0, observationId: $0.observationId, prescriptionId: $0.prescriptionId) }
    }

    func status(_ d: PlannedDose) -> String {
        switch d.status {
        case "taken": return model.t("dose.status.taken", ["time": TimeUtil.parseInstant(d.event?.actualAt)?.formatted(date: .omitted, time: .shortened) ?? ""])
        case "snoozed": return model.t("dose.status.snoozed", ["time": TimeUtil.parseInstant(d.event?.snoozedUntil)?.formatted(date: .omitted, time: .shortened) ?? ""])
        default: return model.t("dose.status." + d.status)
        }
    }
    func mark(_ d: PlannedDose, _ status: String, snooze: Int? = nil) {
        model.change { try Commands.markDose($0, courseId: d.courseId, date: d.date, time: d.time, status: status, snoozeMinutes: snooze, ctx: $1) }
    }
}

extension AppState {
    static func with(_ s: AppState, courses: [Course]) -> AppState { var x = s; x.courses = courses; return x }
}

/// Course exactly as prescribed: nothing is derived from the medication name.
struct CourseForm: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let course: Course?
    let observationId: String
    let prescriptionId: String?
    @State private var name = ""
    @State private var dose = ""
    @State private var instructions = ""
    @State private var start = Date()
    @State private var end = Date().addingTimeInterval(7 * 86400)
    @State private var indefinite = false
    @State private var times: [Date] = [Calendar.current.date(bySettingHour: 8, minute: 0, second: 0, of: Date())!]
    @State private var days: Set<Int> = Set(1...7)

    var body: some View {
        NavigationStack {
            Form {
                Section { Text(model.t("course.intro")).font(.footnote) }
                TextField(model.t("course.name"), text: $name)
                TextField(model.t("course.dose"), text: $dose)
                TextField(model.t("course.instructions"), text: $instructions, axis: .vertical)
                DatePicker(model.t("course.start"), selection: $start, displayedComponents: .date)
                Toggle(model.t("course.indefinite"), isOn: $indefinite)
                if !indefinite { DatePicker(model.t("course.end"), selection: $end, displayedComponents: .date) }
                Section(model.t("course.times")) {
                    ForEach(times.indices, id: \.self) { i in DatePicker(model.t("course.timeN", ["n": i + 1]), selection: $times[i], displayedComponents: .hourAndMinute) }
                    Button(model.t("course.addTime")) { times.append(times.last ?? Date()) }
                    Text(model.t("course.timesHint")).font(.footnote).foregroundStyle(.secondary)
                }
                Section(model.t("course.days")) {
                    ForEach(1...7, id: \.self) { d in
                        Toggle(Calendar.current.weekdaySymbols[d % 7], isOn: Binding(get: { days.contains(d) }, set: { if $0 { days.insert(d) } else { days.remove(d) } }))
                    }
                }
                Section { Text(model.t("course.safety")).font(.footnote) }
            }
            .navigationTitle(course == nil ? model.t("course.addTitle") : model.t("course.editTitle"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(model.t("action.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(model.t("action.save")) {
                        let hm = times.map { String(format: "%02d:%02d", Calendar.current.component(.hour, from: $0), Calendar.current.component(.minute, from: $0)) }
                        let ok = model.change {
                            try Commands.saveCourse($0, id: course?.id, observationId: observationId, prescriptionId: prescriptionId, name: name, dose: dose, instructions: instructions,
                                                    startDate: TimeUtil.localDay(start), endDate: indefinite ? nil : TimeUtil.localDay(end), indefinite: indefinite, times: hm, days: Array(days), ctx: $1).0
                        }
                        if ok {
                            if model.state?.settings.notificationsEnabled == true { Task { _ = await model.notifications.requestAuthorization() } }
                            dismiss()
                        }
                    }
                }
            }
            .onAppear {
                guard let c = course else { return }
                name = c.name; dose = c.dose; instructions = c.instructions; indefinite = c.indefinite
                start = TimeUtil.wallClock(c.startDate, "12:00")
                if let e = c.endDate { end = TimeUtil.wallClock(e, "12:00") }
                times = c.times.map { TimeUtil.wallClock(TimeUtil.localDay(), $0) }
                days = Set(c.days)
            }
        }
    }
}
