import SwiftUI
import SymptoPageCore

struct DoctorsView: View {
    @Environment(AppModel.self) private var model
    @State private var adding = false
    @State private var editing: Doctor?
    @State private var addingObservationFor: Doctor?
    @State private var showArchived = false

    var body: some View {
        let s = model.state!
        List {
            Toggle(model.t("filter.archived"), isOn: $showArchived)
            ForEach(s.doctors.filter { showArchived || $0.archivedAt == nil }) { d in
                Section(model.doctorLabel(d.id) + (d.archivedAt != nil ? " (" + model.t("doctor.archived") + ")" : "")) {
                    if !d.clinic.isEmpty { Text(d.clinic).font(.footnote) }
                    ForEach(s.observations.filter { $0.doctorId == d.id && (showArchived || $0.archivedAt == nil) }) { o in
                        VStack(alignment: .leading) {
                            Text(o.reason).font(.headline)
                            Text(model.t("stage." + o.stage)).font(.footnote).foregroundStyle(.secondary)
                            ForEach(s.visits.filter { $0.observationId == o.id }.sorted { $0.date < $1.date }) { v in
                                NavigationLink(value: v.id) {
                                    Text("\(v.date) · \(model.t("visit.status." + v.status)) · \(model.t("visit.kind." + v.kind))")
                                }
                            }
                        }
                        .swipeActions {
                            Button(o.archivedAt == nil ? model.t("action.archive") : model.t("action.unarchive")) {
                                model.change { try Commands.archiveObservation($0, id: o.id, archived: o.archivedAt == nil, ctx: $1) }
                            }
                        }
                    }
                    Button(model.t("observation.add")) { addingObservationFor = d }
                    Button(model.t("action.edit")) { editing = d }
                    Button(d.archivedAt == nil ? model.t("action.archive") : model.t("action.unarchive")) {
                        model.change { try Commands.archiveDoctor($0, id: d.id, archived: d.archivedAt == nil, ctx: $1) }
                    }
                }
            }
        }
        .navigationTitle(model.t("nav.doctors"))
        .navigationDestination(for: String.self) { VisitDetailView(visitId: $0) }
        .toolbar { Button { adding = true } label: { Label(model.t("doctors.add"), systemImage: "plus") } }
        .sheet(isPresented: $adding) { DoctorForm(doctor: nil, withFirstVisit: false) }
        .sheet(item: $editing) { DoctorForm(doctor: $0, withFirstVisit: false) }
        .sheet(item: $addingObservationFor) { ObservationForm(doctorId: $0.id) }
    }
}

struct DoctorForm: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let doctor: Doctor?
    let withFirstVisit: Bool
    @State private var specialty = "cardiologist"
    @State private var custom = ""
    @State private var name = ""
    @State private var clinic = ""
    @State private var note = ""
    @State private var reason = ""
    @State private var visitDate = Date()

    var body: some View {
        NavigationStack {
            Form {
                Picker(model.t("doctor.specialty"), selection: $specialty) {
                    ForEach(Schema.specialties, id: \.self) { Text(model.t("specialty." + $0)).tag($0) }
                }
                if specialty == "other" { TextField(model.t("doctor.specialtyCustom"), text: $custom) }
                TextField(model.t("doctor.nameOptional"), text: $name)
                TextField(model.t("doctor.clinic"), text: $clinic)
                TextField(model.t("doctor.note"), text: $note, axis: .vertical)
                if withFirstVisit {
                    DatePicker(model.t("visit.date"), selection: $visitDate, displayedComponents: .date)
                    TextField(model.t("observation.reason"), text: $reason, axis: .vertical).lineLimit(2...5)
                }
            }
            .navigationTitle(doctor == nil ? model.t("doctor.addTitle") : model.t("doctor.editTitle"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(model.t("action.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(model.t("action.save")) {
                        let ok = model.change { s, ctx in
                            let (s1, id) = try Commands.saveDoctor(s, id: doctor?.id, specialty: specialty, specialtyCustom: custom, name: name, clinic: clinic, note: note, ctx: ctx)
                            guard withFirstVisit else { return s1 }
                            return try Commands.saveObservation(s1, doctorId: id, reason: reason, visitDate: TimeUtil.localDay(visitDate), ctx: ctx).0
                        }
                        if ok { dismiss() }
                    }
                }
            }
            .onAppear {
                if let d = doctor { specialty = d.specialty; custom = d.specialtyCustom; name = d.name; clinic = d.clinic; note = d.note }
            }
        }
    }
}

struct ObservationForm: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let doctorId: String
    @State private var reason = ""
    @State private var questions = ""
    @State private var date = Date()

    var body: some View {
        NavigationStack {
            Form {
                TextField(model.t("observation.reason"), text: $reason, axis: .vertical).lineLimit(2...5)
                TextField(model.t("observation.questions"), text: $questions, axis: .vertical).lineLimit(2...5)
                DatePicker(model.t("visit.date"), selection: $date, displayedComponents: .date)
            }
            .navigationTitle(model.t("observation.addTitle"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(model.t("action.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(model.t("action.save")) {
                        if model.change({ try Commands.saveObservation($0, doctorId: doctorId, reason: reason, questions: questions, visitDate: TimeUtil.localDay(date), ctx: $1).0 }) { dismiss() }
                    }
                }
            }
        }
    }
}

/// Visit results: notes, recommendations, return advice, follow-up date,
/// prescriptions with their source. (Attachments: Windows only in 0.5.0.)
struct VisitDetailView: View {
    @Environment(AppModel.self) private var model
    let visitId: String
    @State private var notes = ""
    @State private var recommendations = ""
    @State private var returnAdvice = ""
    @State private var hasFollowUp = false
    @State private var followUp = Date()
    @State private var source = "user"
    @State private var newPrescription = ""
    @State private var newKind = "medication"
    @State private var courseFor: Prescription?

    var body: some View {
        if let s = model.state, let v = s.visits.first(where: { $0.id == visitId }) {
            Form {
                Section {
                    Text(v.date + (v.time.map { " · " + $0 } ?? "")).font(.headline)
                    Text(model.t("visit.status." + v.status))
                }
                Section(model.t("outcome.title")) {
                    Text(model.t("outcome.intro")).font(.footnote).foregroundStyle(.secondary)
                    TextField(model.t("outcome.notes"), text: $notes, axis: .vertical).lineLimit(3...8)
                    TextField(model.t("outcome.recommendations"), text: $recommendations, axis: .vertical)
                    TextField(model.t("outcome.returnAdvice"), text: $returnAdvice, axis: .vertical)
                    Toggle(model.t("outcome.followUpDate"), isOn: $hasFollowUp)
                    if hasFollowUp { DatePicker(model.t("outcome.followUpDate"), selection: $followUp, displayedComponents: .date) }
                    Picker(model.t("source.label"), selection: $source) { ForEach(Schema.sources, id: \.self) { Text(model.t("source." + $0)).tag($0) } }
                    Button(model.t("outcome.save")) {
                        model.change { try Commands.saveOutcome($0, visitId: v.id, notes: notes, recommendations: recommendations, followUpDate: hasFollowUp ? TimeUtil.localDay(followUp) : nil, returnAdvice: returnAdvice, source: source, ctx: $1) }
                    }
                    if hasFollowUp {
                        Button(model.t("visit.followUp")) {
                            model.change { try Commands.saveVisit($0, observationId: v.observationId, date: TimeUtil.localDay(followUp), previousVisitId: v.id, ctx: $1).0 }
                        }
                    }
                }
                Section(model.t("prescription.title")) {
                    ForEach(s.prescriptions.filter { $0.visitId == v.id }) { p in
                        VStack(alignment: .leading) {
                            Text(model.t("prescription.kind." + p.kind) + " · " + model.t("source." + p.source)).font(.caption)
                            Text(p.text)
                            if p.kind == "medication" { Button(model.t("prescription.toCourse")) { courseFor = p } }
                        }
                    }
                    Picker(model.t("prescription.kind"), selection: $newKind) { ForEach(Schema.prescriptionKinds, id: \.self) { Text(model.t("prescription.kind." + $0)).tag($0) } }
                    TextField(model.t("prescription.text"), text: $newPrescription, axis: .vertical)
                    Button(model.t("prescription.add")) {
                        if model.change({ try Commands.savePrescription($0, visitId: v.id, kind: newKind, text: newPrescription, source: source, ctx: $1).0 }) { newPrescription = "" }
                    }
                }
            }
            .navigationTitle(model.t("page.visit"))
            .sheet(item: $courseFor) { p in CourseForm(course: nil, observationId: v.observationId, prescriptionId: p.id) }
            .onAppear {
                if let o = v.outcome {
                    notes = o.notes; recommendations = o.recommendations; returnAdvice = o.returnAdvice; source = o.source
                    if let f = o.followUpDate { hasFollowUp = true; followUp = TimeUtil.wallClock(f, "12:00") }
                }
            }
        } else {
            Text(model.t("visit.missing"))
        }
    }
}
