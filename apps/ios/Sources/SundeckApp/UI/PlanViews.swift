#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    // Maintenance plans: the repeat choice, plan dates, a pool's plans on the customer's page, and
    // the plan sheet (website: plan-repeat.tsx and maintenance-plans.tsx; spec 5.5 and 5.9).

    /// How often a plan repeats: a segmented control (Several Days, Weekly, Every 2 Weeks,
    /// Monthly), and for Several Days the days as a row of round toggles, as in iOS Reminders'
    /// custom repeat. New Job uses a menu with "Just once" first (`once`), since five choices
    /// don't fit a phone's row.
    struct PlanRepeatPicker: View {
        @Binding var choice: PlanRepeat?
        @Binding var days: [Int]
        var once = false
        /// "Pick two or more days."
        var error: String?

        private static let week: [(value: Int, short: String, name: String)] = [
            (1, "M", "Monday"), (2, "T", "Tuesday"), (3, "W", "Wednesday"), (4, "T", "Thursday"),
            (5, "F", "Friday"), (6, "S", "Saturday"), (0, "S", "Sunday"),
        ]

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                if once {
                    SelectField(
                        label: "Repeats", selection: $choice, options: [nil] + PlanRepeat.allCases.map { Optional($0) },
                        optionLabel: { $0?.label ?? "Just once" })
                } else {
                    VStack(alignment: .leading, spacing: 4) {
                        FieldLabel("Repeats")
                        Segmented(
                            selection: Binding(get: { choice ?? .weekly }, set: { choice = $0 }),
                            options: PlanRepeat.allCases, label: \.label, title: "Repeats", fillsWidth: true,
                            segmentPadding: 6)
                    }
                }
                if choice == .days {
                    VStack(alignment: .leading, spacing: 4) {
                        FieldLabel("Days")
                        HStack(spacing: 4) {
                            ForEach(Self.week, id: \.value) { day in
                                let on = days.contains(day.value)
                                Button {
                                    days = on ? days.filter { $0 != day.value } : days + [day.value]
                                } label: {
                                    Text(day.short)
                                        .textRole(.bodyEmphasis)
                                        .foregroundStyle(on ? Color.onPrimary : Color.text)
                                        .frame(maxWidth: minTarget, minHeight: minTarget)
                                        .frame(maxWidth: .infinity)
                                        .background(Circle().fill(on ? Color.brandPrimary : Color.fill))
                                        .contentShape(Circle())
                                }
                                .buttonStyle(.plain)
                                .sensoryFeedback(.selection, trigger: on)
                                .accessibilityLabel(day.name)
                                .accessibilityAddTraits(on ? [.isSelected] : [])
                            }
                        }
                        if let error { FieldHint(text: error, error: true) }
                    }
                }
            }
        }
    }

    /// A day ("YYYY-MM-DD") or a time ("HH:MM") as a field opening the system's compact picker,
    /// in the shop's time zone. Optional ones show `placeholder` while blank ("No end date") and
    /// a quiet button that clears them ("No End Date").
    struct PlanDateField: View {
        enum Kind { case day, time }

        var label: String
        @Binding var value: String
        var kind: Kind = .day
        var timeZone: String
        /// What a blank optional field takes when tapped (a day, or "HH:MM").
        var start: String
        var optional = false
        var placeholder = ""
        var clearLabel = ""
        var hint: String?
        var error: String?

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                FieldLabel(label)
                if value.isEmpty && optional {
                    Button {
                        value = start
                    } label: {
                        Text(placeholder).foregroundStyle(Color.placeholder).fieldBox(error: error != nil)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(label)
                    .accessibilityValue(placeholder)
                    .accessibilityHint("Picks a \(kind == .day ? "date" : "time")")
                } else {
                    HStack(spacing: 8) {
                        DatePicker(
                            label, selection: binding, displayedComponents: kind == .day ? .date : .hourAndMinute
                        )
                        .labelsHidden()
                        .datePickerStyle(.compact)
                        .environment(\.timeZone, TimeZone(identifier: timeZone) ?? .current)
                        .tint(Color.link)
                        if optional {
                            Spacer(minLength: 0)
                            Button(clearLabel) { value = "" }
                                .textRole(.body)
                                .foregroundStyle(Color.link)
                                .frame(minHeight: minTarget)
                        }
                    }
                }
                if let error {
                    FieldHint(text: error, error: true)
                } else if let hint {
                    FieldHint(text: hint)
                }
            }
        }

        private var binding: Binding<Date> {
            switch kind {
            case .day:
                Binding(
                    get: { zonedInstant(value.isEmpty ? start : value, 12 * 60, timeZone: timeZone) ?? Date() },
                    set: { value = localDay($0, timeZone: timeZone) })
            case .time:
                Binding(
                    get: {
                        zonedInstant(
                            localDay(Date(), timeZone: timeZone), clockToMinutes(value.isEmpty ? start : value),
                            timeZone: timeZone) ?? Date()
                    },
                    set: { value = minutesToClock(localMinutes($0, timeZone: timeZone)) })
            }
        }
    }

    /// A pool's plans on the customer's page (the website's MaintenancePlans): each plan in one
    /// line with its tech, next visits and visits done; owners and admins open one to change,
    /// pause or end it, or add one.
    struct MaintenancePlansGroup: View {
        var customerId: String
        var pool: CustomerPool
        var canEdit: Bool
        /// What the sheet did, shown at the top of the page.
        var saved: (String) -> Void
        @State private var open: PlanSheetTarget?

        var body: some View {
            Grouped(
                label: "Maintenance",
                footer: pool.plans.isEmpty && !canEdit ? "No regular cleaning for this pool." : nil
            ) {
                ForEach(pool.plans) { plan in
                    if canEdit {
                        Button {
                            open = .plan(plan)
                        } label: {
                            row(plan)
                        }
                        .buttonStyle(.row)
                        .accessibilityHint("Opens the plan to change, pause, or end it.")
                    } else {
                        row(plan)
                    }
                }
                if canEdit {
                    ActionRow("Add Maintenance Plan") { open = .new }
                } else if pool.plans.isEmpty {
                    Text("No regular cleaning")
                        .textRole(.body)
                        .foregroundStyle(Color.textMuted)
                        .padding(.horizontal, 16)
                        .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                }
            }
            .sheet(item: $open) { target in
                PlanSheet(customerId: customerId, propertyId: pool.id, plan: target.plan, saved: saved)
            }
        }

        private func row(_ plan: CustomerPlan) -> some View {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(plan.summary).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                    Text(plan.detail).textRole(.secondary).foregroundStyle(Color.textMuted)
                    ForEach(plan.cleanings) { c in
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            CleaningIcon(kind: c.kind, size: 16).alignmentGuide(.firstTextBaseline) { $0[.bottom] - 3 }
                            (Text("\(c.summary) · ")
                                + Text(c.due).fontWeight(c.soon ? .semibold : nil)
                                .foregroundColor(c.soon ? Color.warning : Color.textMuted)
                                + Text(c.after))
                                .textRole(.secondary)
                                .foregroundStyle(Color.textMuted)
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(c.text)
                    }
                    if let notes = plan.notes {
                        Text(notes).textRole(.secondary).foregroundStyle(Color.textMuted)
                    }
                }
                Spacer(minLength: 0)
                if canEdit { Chevron() }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
        }
    }

    /// Which plan the sheet edits.
    enum PlanSheetTarget: Identifiable {
        case new
        case plan(CustomerPlan)

        var id: String {
            switch self {
            case .new: "new"
            case .plan(let p): p.id
            }
        }

        var plan: CustomerPlan? {
            if case .plan(let p) = self { return p }
            return nil
        }
    }

    /// Add Maintenance Plan / Maintenance Plan: the website's plan form in a sheet. Saves through
    /// the sync layer; the server makes or replaces the plan's visits when it arrives.
    struct PlanSheet: View {
        var customerId: String
        var propertyId: String
        var plan: CustomerPlan?
        var saved: (String) -> Void
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.dismiss) private var dismiss
        @State private var draft: PlanDraft?
        @State private var original: PlanDraft?
        @State private var errors: [String: String] = [:]
        @State private var problem: String?
        @State private var confirmEnd = false
        @State private var done = 0

        var body: some View {
            FormSheet(
                title: plan == nil ? "Add Maintenance Plan" : "Maintenance Plan",
                dirty: draft != nil && draft != original
            ) {
                if let company = session.company, draft != nil {
                    form(company)
                }
            }
            .sensoryFeedback(.success, trigger: done)
            .onAppear {
                guard draft == nil, let company = session.company else { return }
                let today = (try? localDate(Date(), company.timeZone)) ?? localDay(Date(), timeZone: company.timeZone)
                let start = plan.map { PlanDraft($0.plan) } ?? PlanDraft.new(today: today, settings: company.settings)
                draft = start
                original = start
            }
        }

        @ViewBuilder private func form(_ company: CompanyContext) -> some View {
            let d = Binding(get: { draft ?? PlanDraft(startsOn: "", minutes: "") }, set: { draft = $0 })
            let team = teamMembers(sync.store, kv: sync.kv, companyId: company.id, userId: session.user?.id ?? "")
                .filter(\.active)
            VStack(alignment: .leading, spacing: 16) {
                PlanRepeatPicker(
                    choice: Binding(get: { d.wrappedValue.repeats }, set: { d.wrappedValue.repeats = $0 ?? .weekly }),
                    days: d.days, error: errors["weekdays"])
                PlanDateField(
                    label: "First visit", value: d.startsOn, timeZone: company.timeZone,
                    start: d.wrappedValue.startsOn, hint: firstVisitHint(d.wrappedValue.repeats, long: true),
                    error: errors["startsOn"])
                SelectField(
                    label: "Tech", selection: d.tech, options: [nil] + team.map { Optional($0.id) },
                    optionLabel: { id in
                        id.map { id in team.first { $0.id == id }?.name ?? "Teammate" } ?? "Nobody yet"
                    })
                PlanDateField(
                    label: "Time (optional)", value: d.time, kind: .time, timeZone: company.timeZone, start: "09:00",
                    optional: true, placeholder: "Any time", clearLabel: "Any Time",
                    hint: "Leave blank and route planning picks it.", error: errors["time"])
                OutlinedField(
                    label: "Visit length (minutes)", text: d.minutes, error: errors["minutes"], keyboard: .numberPad)
                OutlinedField(
                    label: "Price per month ($)", text: d.price, hint: "Billed once a month on the customer's invoice.",
                    error: errors["price"], keyboard: .decimalPad)
                PlanDateField(
                    label: "Last visit (optional)", value: d.endsOn, timeZone: company.timeZone,
                    start: d.wrappedValue.startsOn, optional: true, placeholder: "No end date",
                    clearLabel: "No End Date", error: errors["endsOn"])
                OutlinedField(
                    label: "Notes for the tech", text: d.notes, hint: "Gate code, dog in the yard, chemicals to bring.",
                    multiline: true)
            }
            .card()
            Text("Regular cleanings, like a filter every 3 months, are set on the website.")
                .textRole(.footnote)
                .foregroundStyle(Color.textMuted)
                .padding(.horizontal, 16)
            if !errors.isEmpty { Notice(kind: .error, text: "Fix the highlighted fields.") }
            if let problem { Notice(kind: .error, text: problem) }
            Button(plan == nil ? "Add Plan" : "Save Plan") { save(company) }
                .buttonStyle(.primary(fullWidth: true, size: .field))
            if let plan {
                VStack(spacing: 12) {
                    Hairline()
                    Button(plan.plan.paused ? "Resume" : "Pause") { setPaused(company, !plan.plan.paused) }
                        .buttonStyle(.secondary(fullWidth: true, size: .field))
                    Button("End Plan", role: .destructive) { confirmEnd = true }
                        .buttonStyle(.danger(fullWidth: true, size: .field))
                }
                .confirmationDialog("End this plan?", isPresented: $confirmEnd, titleVisibility: .visible) {
                    Button("End Plan", role: .destructive) { end(plan) }
                } message: {
                    Text("Its upcoming visits leave the schedule; finished visits are kept.")
                }
            }
        }

        private func save(_ company: CompanyContext) {
            guard let draft else { return }
            switch draft.check() {
            case .failure(let problems):
                errors = problems.fields
            case .success(let values):
                errors = [:]
                finish {
                    try PlanWrites.save(
                        sync, companyId: company.id, planId: plan?.id, customerId: customerId, propertyId: propertyId,
                        values
                    ).message
                }
            }
        }

        private func setPaused(_ company: CompanyContext, _ paused: Bool) {
            guard let plan else { return }
            finish { try PlanWrites.setPaused(sync, companyId: company.id, planId: plan.id, paused) }
        }

        private func end(_ plan: CustomerPlan) {
            finish { try PlanWrites.end(sync, planId: plan.id) }
        }

        /// Runs a write; on success says what it did on the page and closes the sheet.
        private func finish(_ write: () throws -> String) {
            do {
                let message = try write()
                done += 1
                saved(message)
                dismiss()
            } catch {
                problem = userMessage(error)
            }
        }
    }
#endif
