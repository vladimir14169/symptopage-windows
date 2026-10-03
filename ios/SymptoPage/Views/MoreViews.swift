import SwiftUI
import SymptoPageCore
import UniformTypeIdentifiers

struct MoreView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        List {
            NavigationLink(model.t("nav.report")) { ReportView() }
            NavigationLink(model.t("nav.progress")) { ProgressScreen() }
            NavigationLink(model.t("nav.help")) { HelpView() }
            NavigationLink(model.t("nav.settings")) { SettingsView() }
        }
        .navigationTitle("SymptoPage")
    }
}

/// Self-assessment and record counts with explicit gaps. No conclusions.
struct ProgressScreen: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        let s = model.state!
        let today = TimeUtil.localDay()
        List {
            Section { Text(model.t("progress.notice")).font(.footnote) }
            ForEach(model.visibleObservations) { o in
                Section(model.doctorLabel(o.doctorId) + " — " + o.reason) {
                    let current = s.assessments.first { $0.observationId == o.id && $0.date == today }?.rating
                    Picker(model.t("progress.selfQuestion"), selection: Binding(get: { current ?? "" }, set: { r in model.change { try Commands.saveAssessment($0, observationId: o.id, date: today, rating: r, ctx: $1) } })) {
                        ForEach(Schema.ratings, id: \.self) { Text(model.t("rating." + $0)).tag($0) }
                    }.pickerStyle(.segmented)
                }
            }
            Section(model.t("progress.chartsTitle")) {
                let from = TimeUtil.addDays(today, -29)
                let days = Set(s.entries.compactMap { TimeUtil.parseInstant($0.occurredAt).map { TimeUtil.localDay($0) } }.filter { $0 >= from } + s.dailyRatings.map(\.date).filter { $0 >= from })
                Text(model.t("progress.coverage", ["recorded": days.count, "total": 30, "missing": 30 - days.count]))
                Text(model.t("progress.disclaimer")).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle(model.t("nav.progress"))
    }
}

struct HelpView: View {
    @Environment(AppModel.self) private var model
    static let contacts: [String: [(String, String)]] = [
        "PL": [("112", "emergency"), ("999", "ambulance"), ("800 190 590", "patientInfoPL")],
        "DE": [("112", "emergency"), ("116117", "onCallDE")],
        "GB": [("999", "emergency"), ("112", "emergency"), ("111", "nhs111")],
        "IE": [("112", "emergency"), ("999", "emergency")],
        "US": [("911", "emergency"), ("988", "crisisUS")],
        "EU": [("112", "emergency")],
    ]
    var body: some View {
        let country = model.state?.settings.country
        List {
            Section {
                Text(model.t("help.title")).font(.headline)
                Text(model.t("help.intro"))
                Text(model.t("help.notMonitored")).font(.callout.bold())
            }
            Section(model.t("help.country")) {
                Picker(model.t("help.country"), selection: Binding(get: { country ?? "" }, set: { c in model.change { s, _ in try Commands.updateSettings(s, country: .some(c.isEmpty ? nil : c)) } })) {
                    Text(model.t("help.countryChoose")).tag("")
                    ForEach(Schema.countries, id: \.self) { Text(model.t("country." + $0)).tag($0) }
                }
                if let country, let list = Self.contacts[country] {
                    ForEach(list, id: \.0) { n, kind in
                        if let url = URL(string: "tel:" + n.replacingOccurrences(of: " ", with: "")) {
                            Link(destination: url) { VStack(alignment: .leading) { Text(n).font(.title2.bold()); Text(model.t("contact." + kind)).font(.footnote) } }
                        }
                    }
                } else {
                    Text(model.t("help.countryFirst")).foregroundStyle(.secondary)
                }
            }
            Section(model.t("help.triageTitle")) { Text(model.t("help.triageUnavailable")) }
        }
        .navigationTitle(model.t("nav.help"))
    }
}

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var exporting = false
    @State private var importing = false
    @State private var replace = false
    @State private var message: String?
    @State private var exportDoc: BackupDocument?

    var body: some View {
        let st = model.state!.settings
        Form {
            Picker(model.t("settings.language"), selection: Binding(get: { st.language }, set: { l in model.change { s, _ in try Commands.updateSettings(s, language: l) } })) {
                Text("English").tag("en"); Text("Polski").tag("pl")
            }
            Section(model.t("settings.reminders")) {
                Toggle(model.t("settings.notifyEnabled"), isOn: Binding(get: { st.notificationsEnabled }, set: { v in
                    model.change { s, _ in try Commands.updateSettings(s, notificationsEnabled: v) }
                    if v { Task { _ = await model.notifications.requestAuthorization() } }
                }))
                Toggle(model.t("settings.notifyDetails"), isOn: Binding(get: { st.notificationDetails }, set: { v in model.change { s, _ in try Commands.updateSettings(s, notificationDetails: v) } }))
                Text(model.t("settings.notifyDetailsHint")).font(.footnote)
                Text(model.t("ios.notifyLimits")).font(.footnote).foregroundStyle(.secondary)
            }
            Section(model.t("settings.backup")) {
                Text(model.t("settings.backupIntro")).font(.footnote)
                Button(model.t("settings.export")) {
                    if let data = try? model.exportBackup() { exportDoc = BackupDocument(data: data); exporting = true }
                }
                Button(model.t("settings.importMerge")) { replace = false; importing = true }
                Button(model.t("settings.importReplace"), role: .destructive) { replace = true; importing = true }
                Text(model.t("ios.noSync")).font(.footnote).foregroundStyle(.secondary)
            }
            Section(model.t("settings.about")) {
                Text("SymptoPage " + (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")).font(.headline)
                Text(model.t("settings.aboutBody")).font(.footnote)
                Text(model.t("app.disclaimer")).font(.footnote)
            }
        }
        .navigationTitle(model.t("nav.settings"))
        .fileExporter(isPresented: $exporting, document: exportDoc, contentType: .json, defaultFilename: "SymptoPage-backup-\(TimeUtil.localDay()).json") { _ in }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            guard case .success(let url) = result else { return }
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            if let data = try? Data(contentsOf: url) { message = model.importBackup(data, replace: replace) }
        }
        .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) { Button("OK") {} }
    }
}

struct BackupDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

struct ProblemView: View {
    @Environment(AppModel.self) private var model
    @State private var confirm = false
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(model.t("problem.title")).font(.title2.bold())
            Text(model.t("problem.body"))
            Text(model.t("problem.code") + ": " + (model.problem ?? "")).font(.footnote.monospaced())
            Text(model.t("problem.freshBody")).font(.footnote)
            Button(model.t("problem.fresh"), role: .destructive) { confirm = true }
        }
        .padding()
        .confirmationDialog(model.t("problem.freshConfirm"), isPresented: $confirm, titleVisibility: .visible) {
            Button(model.t("problem.fresh"), role: .destructive) { model.startEmptyKeepingDamaged() }
        }
    }
}
