import SwiftUI
import SymptoPageCore

struct RootView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        if model.state == nil {
            ProblemView()
        } else {
            TabView {
                NavigationStack { HomeView() }.tabItem { Label(model.t("nav.home"), systemImage: "house") }
                NavigationStack { JournalView() }.tabItem { Label(model.t("nav.journal"), systemImage: "list.bullet.rectangle") }
                NavigationStack { DoctorsView() }.tabItem { Label(model.t("nav.doctors"), systemImage: "stethoscope") }
                NavigationStack { MedicationsView() }.tabItem { Label(model.t("nav.medications"), systemImage: "pills") }
                NavigationStack { MoreView() }.tabItem { Label(model.t("nav.settings"), systemImage: "ellipsis.circle") }
            }
            .alert(model.lastError ?? "", isPresented: Binding(get: { model.lastError != nil }, set: { if !$0 { model.lastError = nil } })) {
                Button("OK", role: .cancel) {}
            }
        }
    }
}

/// "All doctors" / single / several — the active selection is always spelled out.
struct DoctorFilter: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        let doctors = model.state?.doctors.filter { $0.archivedAt == nil } ?? []
        if !doctors.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        chip(model.t("filter.all"), on: model.filterDoctorIds.isEmpty) { model.filterDoctorIds = [] }
                        ForEach(doctors) { d in
                            chip(model.doctorLabel(d.id), on: model.filterDoctorIds.contains(d.id)) {
                                if model.filterDoctorIds.contains(d.id) { model.filterDoctorIds.removeAll { $0 == d.id } } else { model.filterDoctorIds.append(d.id) }
                            }
                        }
                    }
                }
                Text(model.filterDoctorIds.isEmpty ? model.t("filter.showingAll") : model.t("filter.showing") + ": " + model.filterDoctorIds.map(model.doctorLabel).joined(separator: ", "))
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
    }
    func chip(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: on ? "checkmark" : "circle").labelStyle(.titleAndIcon)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(on ? Theme.accent : Theme.chip, in: Capsule())
                .foregroundStyle(on ? .white : Theme.ink)
        }
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var showEntry = false
    @State private var showFirst = false

    var body: some View {
        let s = model.state!
        List {
            if s.doctors.isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(model.t("welcome.title")).font(.title2.bold())
                        Text(model.t("welcome.body"))
                        Text(model.t("welcome.noDemo")).font(.footnote).foregroundStyle(.secondary)
                        Button(model.t("welcome.formTitle")) { showFirst = true }.buttonStyle(.borderedProminent)
                    }
                }
            } else {
                if let note = model.migrationNote { Section { Text(note).font(.footnote) } }
                Section { DoctorFilter() }
                Section {
                    Button { showEntry = true } label: {
                        Label(model.t("now.button"), systemImage: "square.and.pencil").font(.title3.bold()).frame(maxWidth: .infinity).padding(.vertical, 6)
                    }
                    .buttonStyle(.borderedProminent).tint(Theme.coral).foregroundStyle(Theme.ink)
                    .accessibilityHint(model.t("now.hint"))
                    Text(model.t("now.hint")).font(.footnote).foregroundStyle(.secondary)
                }
                Section(model.t("home.upcoming")) {
                    let ids = Set(model.visibleObservations.map(\.id))
                    let today = TimeUtil.localDay()
                    let visits = s.visits.filter { ids.contains($0.observationId) && $0.status == "planned" && $0.date >= today }.sorted { $0.date < $1.date }
                    if visits.isEmpty { Text(model.t("home.noUpcoming")).foregroundStyle(.secondary) }
                    ForEach(visits) { v in
                        NavigationLink(value: v.id) { VisitRow(visit: v) }
                    }
                }
                Section(model.t("home.observations")) {
                    ForEach(model.visibleObservations) { o in StageCard(observation: o) }
                }
            }
        }
        .navigationTitle(model.t("nav.home"))
        .navigationDestination(for: String.self) { VisitDetailView(visitId: $0) }
        .sheet(isPresented: $showEntry) { EntryForm(entry: nil) }
        .sheet(isPresented: $showFirst) { DoctorForm(doctor: nil, withFirstVisit: true) }
    }
}

struct VisitRow: View {
    @Environment(AppModel.self) private var model
    let visit: Visit
    var body: some View {
        let o = model.state?.observations.first { $0.id == visit.observationId }
        let days = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()), to: TimeUtil.wallClock(visit.date, "12:00")).day ?? 0
        VStack(alignment: .leading) {
            Text(model.doctorLabel(o?.doctorId ?? "")).font(.caption.bold()).textCase(.uppercase)
            Text(visit.date + (visit.time.map { " · " + $0 } ?? "")).font(.headline)
            Text(days == 0 ? model.t("visit.today") : "\(days) " + model.t("visit.daysUntil", ["n": days])).font(.subheadline)
            Text(o?.reason ?? "").font(.footnote).foregroundStyle(.secondary)
        }
    }
}

struct StageCard: View {
    @Environment(AppModel.self) private var model
    let observation: Observation
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(model.doctorLabel(observation.doctorId)).font(.caption.bold()).textCase(.uppercase)
            Text(observation.reason).font(.headline)
            Picker(model.t("stage.label"), selection: Binding(get: { observation.stage }, set: { st in model.change { try Commands.setStage($0, id: observation.id, stage: st, ctx: $1) } })) {
                ForEach(Schema.stages, id: \.self) { Text(model.t("stage." + $0)).tag($0) }
            }
            Text(model.t("stage.hint")).font(.footnote).foregroundStyle(.secondary)
        }
    }
}

/// Quick entry: the event time defaults to the moment the button was pressed.
struct EntryForm: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let entry: Entry?
    @State private var symptom = "palpitations"
    @State private var customLabel = ""
    @State private var occurredAt = Date()
    @State private var note = ""
    @State private var intensity: Int? = nil
    @State private var duration = ""
    @State private var count = ""
    @State private var trigger = ""
    @State private var links: Set<String> = []
    @State private var more = false

    var body: some View {
        NavigationStack {
            Form {
                Section(model.t("entry.symptom")) {
                    Picker(model.t("entry.symptom"), selection: $symptom) {
                        ForEach(Schema.symptoms, id: \.self) { Text($0 == "custom" ? model.t("symptom.customChoice") : model.t("symptom." + $0)).tag($0) }
                    }
                    if symptom == "custom" { TextField(model.t("entry.customLabel"), text: $customLabel) }
                }
                Section {
                    DatePicker(model.t("entry.time"), selection: $occurredAt, in: ...Date())
                    Text(entry == nil ? model.t("entry.timeCaptured") : model.t("entry.timeEdit", ["created": entry!.createdAt])).font(.footnote).foregroundStyle(.secondary)
                    TextField(model.t("entry.note"), text: $note, axis: .vertical).lineLimit(2...6)
                }
                DisclosureGroup(model.t("entry.more"), isExpanded: $more) {
                    Picker(model.t("entry.intensity"), selection: $intensity) {
                        Text(model.t("entry.notSet")).tag(Int?.none)
                        ForEach(Schema.intensities, id: \.self) { Text(model.t("intensity.\($0)")).tag(Int?.some($0)) }
                    }
                    TextField(model.t("entry.duration") + " (" + model.t("unit.min") + ")", text: $duration).keyboardType(.numberPad)
                    TextField(model.t("entry.count"), text: $count).keyboardType(.numberPad)
                    TextField(model.t("entry.trigger"), text: $trigger)
                    ForEach(model.state?.observations.filter { $0.archivedAt == nil } ?? []) { o in
                        Toggle(model.doctorLabel(o.doctorId) + " — " + o.reason, isOn: Binding(get: { links.contains(o.id) }, set: { if $0 { links.insert(o.id) } else { links.remove(o.id) } }))
                    }
                    Text(model.t("entry.linksHint")).font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle(entry == nil ? model.t("entry.newTitle") : model.t("entry.editTitle"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(model.t("action.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(model.t("entry.save")) {
                        let ok = model.change {
                            try Commands.saveEntry($0, id: entry?.id, symptom: symptom, customLabel: customLabel, occurredAt: TimeUtil.iso(occurredAt), note: note,
                                                   durationMinutes: Int(duration), intensity: intensity, count: Int(count), trigger: trigger, observationIds: Array(links), ctx: $1).0
                        }
                        if ok { dismiss() }
                    }
                }
            }
            .onAppear(perform: load)
        }
    }

    func load() {
        if let e = entry {
            symptom = e.symptom; customLabel = e.customLabel; note = e.note; intensity = e.intensity
            occurredAt = TimeUtil.parseInstant(e.occurredAt) ?? Date()
            duration = e.durationMinutes.map(String.init) ?? ""; count = e.count.map(String.init) ?? ""
            trigger = e.trigger; links = Set(e.observationIds)
            more = e.intensity != nil || e.durationMinutes != nil || e.count != nil || !e.trigger.isEmpty
        } else {
            let active = model.visibleObservations
            links = Set(model.filterDoctorIds.isEmpty ? (active.count == 1 ? [active[0].id] : []) : active.map(\.id))
        }
    }
}

struct JournalView: View {
    @Environment(AppModel.self) private var model
    @State private var query = ""
    @State private var editing: Entry?
    @State private var adding = false

    var body: some View {
        let s = model.state!
        let ids = Set(model.visibleObservations.map(\.id))
        let entries = s.entries.filter { e in
            (model.filterDoctorIds.isEmpty || e.observationIds.isEmpty || e.observationIds.contains { ids.contains($0) })
                && (query.isEmpty || [e.note, e.trigger, e.customLabel].contains { $0.localizedCaseInsensitiveContains(query) })
        }
        List {
            Section { DoctorFilter() }
            Section(model.t("journal.events")) {
                if entries.isEmpty { Text(model.t("journal.empty")).foregroundStyle(.secondary) }
                ForEach(entries) { e in
                    Button { editing = e } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(model.symptomLabel(e.symptom, e.customLabel)).font(.headline)
                            Text(TimeUtil.parseInstant(e.occurredAt)?.formatted(date: .abbreviated, time: .shortened) ?? e.occurredAt).font(.subheadline)
                            if !e.note.isEmpty { Text(e.note).font(.body) }
                            Text(model.t("entry.linkedTo") + ": " + (e.observationIds.isEmpty ? model.t("entry.general") : e.observationIds.compactMap { id in s.observations.first { $0.id == id }.map { model.doctorLabel($0.doctorId) } }.joined(separator: ", ")))
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    .foregroundStyle(Theme.ink)
                    .swipeActions {
                        Button(model.t("action.delete"), role: .destructive) { model.change { try Commands.deleteEntry($0, id: e.id) } }
                    }
                }
            }
            Section(model.t("journal.daily")) {
                Text(model.t("daily.missingNote")).font(.footnote).foregroundStyle(.secondary)
                ForEach(s.dailyRatings) { r in
                    Text("\(r.date) · \(model.symptomLabel(r.symptom, r.customLabel)) · \(model.t("frequency." + r.frequency))")
                }
            }
        }
        .searchable(text: $query, prompt: model.t("journal.search"))
        .navigationTitle(model.t("nav.journal"))
        .toolbar { Button { adding = true } label: { Label(model.t("journal.add"), systemImage: "plus") } }
        .sheet(item: $editing) { EntryForm(entry: $0) }
        .sheet(isPresented: $adding) { EntryForm(entry: nil) }
    }
}
