// Doctor report on iOS: same structure as the Windows PDF (summary first,
// chronology as appendix), rendered from HTML with UIPrintPageRenderer, which
// paginates long content. Shared through the system share sheet (print, Files, Mail).
import SwiftUI
import SymptoPageCore
import UIKit

struct ReportView: View {
    @Environment(AppModel.self) private var model
    @State private var from = Calendar.current.date(byAdding: .day, value: -29, to: Date())!
    @State private var to = Date()
    @State private var pdf: URL?

    var body: some View {
        Form {
            Section(model.t("report.options")) {
                DatePicker(model.t("journal.from"), selection: $from, displayedComponents: .date)
                DatePicker(model.t("journal.to"), selection: $to, in: from..., displayedComponents: .date)
                DoctorFilter()
            }
            Section {
                Button(model.t("report.pdf")) { pdf = try? makePDF() }
                if let pdf { ShareLink(item: pdf) { Label(model.t("report.print"), systemImage: "square.and.arrow.up") } }
            }
            Section(model.t("report.preview")) {
                Text(model.t("report.disclaimer")).font(.footnote)
                Text(summaryText()).font(.callout)
            }
        }
        .navigationTitle(model.t("nav.report"))
    }

    var range: (String, String) { (TimeUtil.localDay(from), TimeUtil.localDay(to)) }

    func scoped() -> ([Entry], [DailyRating], [ObservationPeriod]) {
        let s = model.state!
        let obs: [ObservationPeriod] = model.visibleObservations
        let ids = Set(obs.map { $0.id })
        let (a, b) = range
        let entries = s.entries.filter { e in
            let d = TimeUtil.parseInstant(e.occurredAt).map { TimeUtil.localDay($0) } ?? ""
            return d >= a && d <= b && (e.observationIds.isEmpty || e.observationIds.contains { ids.contains($0) })
        }.sorted { $0.occurredAt < $1.occurredAt }
        let ratings = s.dailyRatings.filter { $0.date >= a && $0.date <= b && ($0.observationIds.isEmpty || $0.observationIds.contains { ids.contains($0) }) }
        return (entries, ratings, obs)
    }

    func summaryText() -> String {
        let (entries, ratings, _) = scoped()
        let groups = Dictionary(grouping: entries, by: \.symptomKey)
        if groups.isEmpty && ratings.isEmpty { return model.t("report.noRecords") }
        return groups.map { key, list in "\(model.symptomLabel(list[0].symptom, list[0].customLabel)): \(model.t("report.colEvents")) \(list.count)" }.sorted().joined(separator: "\n")
    }

    func esc(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\n", with: "<br>")
    }

    func html() -> String {
        let s = model.state!
        let (entries, ratings, obs) = scoped()
        let (a, b) = range
        var h = "<html><head><meta charset='utf-8'><style>body{font-family:-apple-system;font-size:11pt;color:#000}h1{font-size:17pt;border-bottom:2px solid #167374}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:3px;text-align:left;font-size:9.5pt}.s{color:#444;font-size:9pt}.pb{page-break-before:always}</style></head><body>"
        let title = model.t("report.docTitle")
        let period = model.t("report.period", ["from": a, "to": b])
        let disclaimer = model.t("report.disclaimer")
        h += "<p class='s'>SymptoPage</p><h1>" + title + "</h1>"
        h += "<p class='s'>" + period + "</p><p><i>" + disclaimer + "</i></p>"
        let reasons: [String] = obs.map { o in "<li><b>" + esc(model.doctorLabel(o.doctorId)) + "</b> — " + esc(o.reason) + "</li>" }
        h += "<h3>" + model.t("report.reasons") + "</h3><ul>" + reasons.joined() + "</ul>"
        h += "<h3>\(model.t("report.symptoms"))</h3>"
        if entries.isEmpty && ratings.isEmpty { h += "<p>\(model.t("report.noRecords"))</p>" } else {
            h += "<p class='s'>\(model.t("report.gapNote"))</p><table><tr><th>\(model.t("entry.symptom"))</th><th>\(model.t("report.colEvents"))</th><th>\(model.t("report.colIntensity"))</th></tr>"
            for (_, list) in Dictionary(grouping: entries, by: \.symptomKey).sorted(by: { $0.value.count > $1.value.count }) {
                let maxI = list.compactMap(\.intensity).max().map { model.t("intensity.\($0)") } ?? "—"
                h += "<tr><td>\(esc(model.symptomLabel(list[0].symptom, list[0].customLabel)))</td><td>\(list.count)</td><td>\(maxI)</td></tr>"
            }
            h += "</table>"
        }
        let courses = s.courses.filter { c in obs.contains { $0.id == c.observationId } }
        h += "<h3>\(model.t("report.medications"))</h3>"
        h += courses.isEmpty ? "<p>\(model.t("report.noMedications"))</p>" : "<ul>" + courses.map { "<li>\(esc($0.name)) — \(esc($0.dose)) · \($0.times.joined(separator: ", "))</li>" }.joined() + "</ul>"
        let questions = obs.map(\.questions).filter { !$0.isEmpty }
        h += "<h3>\(model.t("report.questions"))</h3>" + (questions.isEmpty ? "<p>\(model.t("report.noQuestions"))</p>" : questions.map { "<p>\(esc($0))</p>" }.joined())
        h += "<div class='pb'><h2>\(model.t("report.appendix"))</h2><ol>"
        h += entries.map { e in "<li><b>\(TimeUtil.parseInstant(e.occurredAt)?.formatted(date: .abbreviated, time: .shortened) ?? e.occurredAt)</b> — \(esc(model.symptomLabel(e.symptom, e.customLabel)))\(e.note.isEmpty ? "" : "<br>" + esc(e.note))</li>" }.joined()
        h += "</ol>" + (entries.isEmpty ? "<p>\(model.t("report.noEvents"))</p>" : "") + "</div><p class='s'>\(model.t("report.footer"))</p></body></html>"
        return h
    }

    @MainActor
    func makePDF() throws -> URL {
        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(UIMarkupTextPrintFormatter(markupText: html()), startingAtPageAt: 0)
        let a4 = CGRect(x: 0, y: 0, width: 595.2, height: 841.8)
        renderer.setValue(a4, forKey: "paperRect")
        renderer.setValue(a4.insetBy(dx: 40, dy: 45), forKey: "printableRect")
        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, a4, nil)
        for i in 0..<renderer.numberOfPages {
            UIGraphicsBeginPDFPage()
            renderer.drawPage(at: i, in: UIGraphicsGetPDFContextBounds())
        }
        UIGraphicsEndPDFContext()
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("SymptoPage-\(range.0)_\(range.1).pdf")
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        return url
    }
}
