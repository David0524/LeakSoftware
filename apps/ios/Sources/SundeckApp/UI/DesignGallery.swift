#if os(iOS)
    import SundeckCore
    import SwiftUI

    /// Every design-system component in its states, on one long screen, for the screenshot tests
    /// and for checking the look against the website (docs/design/2026-10-19-native-apps-follow-web.md).
    /// Needs no app environment.
    struct DesignGallery: View {
        @State private var segment = "Jobs"
        @State private var day = "Week"
        @State private var appearance = Appearance.light
        @State private var section = "Checklist"
        @State private var filter = "All"
        @State private var name = "Riley Rivera"
        @State private var fee = "649.00"
        @State private var empty = ""
        @State private var notes = ""
        @State private var query = "Riv"
        @State private var noQuery = ""
        @State private var severity = "Major"
        @State private var directions = "Automatic"
        @State private var textCustomer = true
        @State private var reminders = false
        @State private var date = Date(timeIntervalSince1970: 1_792_400_400)

        var body: some View {
            NavigationStack {
                ScreenScroll {
                    PageHeader {
                        Text("Monday, October 19")
                        Text("· 72°")
                    } actions: {
                        Button("Start Job") {}.buttonStyle(.primary)
                    }
                    SyncBar(
                        message: SyncBarMessage(text: "2 changes waiting to sync", tone: .attention), action: {})
                    SyncBar(message: SyncBarMessage(text: "Syncing…", tone: .working), action: {})
                    SyncBar(
                        message: SyncBarMessage(text: "1 change could not be saved · tap for details", tone: .problem),
                        action: {})
                    SyncBar(
                        message: SyncBarMessage(text: "All changes saved to the office · just now", tone: .good),
                        action: {})
                    TipCard(
                        title: "Your day, in order",
                        message: "Stops are in route order. Tap one to open the job.", close: {})
                    type
                    colors
                    chips
                    buttons
                    pills
                    segmented
                    contacts
                    notices
                    EmptyState(text: "Nothing on your route today.", link: "Open the schedule.") {}
                    lists
                    fields
                    cards
                }
                .navigationTitle("Design")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        BarIconButton(systemImage: "plus", label: "New Job") {}
                    }
                }
            }
        }

        private var type: some View {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeading("Type")
                ForEach(TypeRole.allCases, id: \.self) { role in
                    Text(role.rawValue).textRole(role).foregroundStyle(Color.text)
                }
                Text("$1,249.50 · 20.0 PSI").textRole(.body).tabular()
            }
        }

        private var colors: some View {
            let swatches: [(String, Color)] = [
                ("bg", .bg), ("surface", .surface), ("text", .text), ("textMuted", .textMuted),
                ("primary", .brandPrimary), ("link", .link), ("controlBorder", .controlBorder), ("fill", .fill),
                ("separator", .separator), ("thumb", .thumb), ("diagramWater", .diagramWater), ("pass", .pass),
                ("fail", .fail), ("warning", .warning), ("excluded", .excluded), ("info", .info),
                ("tinted", .tinted), ("iconTint", .iconTint), ("dangerTint", .dangerTint), ("well", .well),
                ("emptyFill", .emptyFill), ("accessFill", .accessFill), ("rowPressed", .rowPressed),
            ]
            return VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Color")
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 8)], alignment: .leading, spacing: 8) {
                    ForEach(swatches, id: \.0) { name, color in
                        VStack(alignment: .leading, spacing: 4) {
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(color)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .strokeBorder(Color.separator, lineWidth: 0.5)
                                )
                                .frame(height: 36)
                            Text(name).textRole(.footnote).foregroundStyle(Color.textMuted)
                        }
                    }
                }
            }
        }

        private var chips: some View {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Status chips")
                FlowRow {
                    ForEach(JobStatus.allCases, id: \.self) { StatusChip(status: $0) }
                    OutcomeChip(outcome: .pass)
                    OutcomeChip(outcome: .fail)
                    OutcomeChip(outcome: .inconclusive)
                    LockLabel("Time locked")
                    CountBadge(text: "3")
                    CountBadge(text: "99+")
                    CountBadge(text: "2", tone: .warning)
                }
            }
        }

        private var buttons: some View {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Buttons")
                HStack(spacing: 12) {
                    Button("Start Job") {}.buttonStyle(.primary)
                    Button("Create Job") {}.buttonStyle(.primary).disabled(true)
                }
                HStack(spacing: 12) {
                    Button {
                    } label: {
                        Label("Search", systemImage: "magnifyingglass")
                    }
                    .buttonStyle(.secondary)
                    Button("Cancel Job") {}.buttonStyle(.danger)
                    Button("Report") {}.buttonStyle(.quiet)
                }
                HStack(spacing: 8) {
                    Button("Plan Route") {}.buttonStyle(.secondary(fullWidth: true))
                    Button("Apple Maps") {}.buttonStyle(.secondary(fullWidth: true))
                }
                Button {
                } label: {
                    BusyButtonLabel("Save", busy: true, busyTitle: "Saving…")
                }
                .buttonStyle(.primary)
                Button("Delete Test") {}.buttonStyle(.danger(fullWidth: true, size: .field))
                Button("Download PDF") {}.buttonStyle(.quiet(size: .small))
            }
        }

        private var pills: some View {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Pills")
                FilterPills(
                    selection: $filter, options: ["All", "Scheduled", "In progress", "Report sent", "Paid"],
                    label: { $0 }
                )
                .padding(.horizontal, -CGFloat(Spacing.pageMargin))
            }
        }

        private var segmented: some View {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Segmented")
                Segmented(selection: $segment, options: ["Jobs", "Reports"], label: { $0 }, minSegmentWidth: 112)
                Segmented(
                    selection: $day, options: ["Day", "Week", "Month"], label: { $0 }, segmentPadding: 12)
                Segmented(
                    selection: $appearance, options: Appearance.allCases, label: \.label, minSegmentWidth: 80)
                SectionSwitcher(
                    selection: $section, options: ["Details", "Checklist", "Findings", "Photos", "Wrap-Up"],
                    label: { $0 }, badge: { $0 == "Checklist" ? 4 : 0 })
            }
        }

        private var contacts: some View {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Contact buttons")
                HStack(spacing: 8) {
                    RoundIconButton(systemImage: "phone", label: "Call Riley Rivera") {}
                    RoundIconButton(systemImage: "message", label: "Text Riley Rivera") {}
                    RoundIconButton(systemImage: "envelope", label: "Email Riley Rivera") {}
                }
            }
        }

        private var notices: some View {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeading("Notices")
                Notice(kind: .info, text: "Quotes sync when you're back online.")
                Notice(kind: .warning, text: "No company number yet.", link: "Set Up a Number") {}
                Notice(kind: .error, text: "That code didn't work. Try the newest one.")
                Notice(kind: .success, text: "Saved.")
            }
        }

        private var lists: some View {
            VStack(alignment: .leading, spacing: 24) {
                Grouped(label: "Customer", footer: "Shown on the report.") {
                    Button {
                    } label: {
                        ListRow("Riley Rivera", detail: "1423 Palm Ct, Mesa", emphasized: true, chevron: true)
                    }
                    .buttonStyle(.row)
                    ListRow("Tech", value: "Tony Tech")
                    ListRow("Detection fee", value: "$649.00", valueStyle: .money)
                    ListRow("Job #1042", detail: "Leak detection · Today 9:00 AM") { StatusChip(status: .inProgress) }
                    StackedRow(caption: "Why they called", value: "Pool water level dropping")
                    ActionRow("Edit Contact Details") {}
                }
                Grouped(label: "On this device") {
                    ListRow("Appearance") {
                        Segmented(
                            selection: $appearance, options: Appearance.allCases, label: \.label,
                            minSegmentWidth: 80)
                    }
                    ListRow("Directions open in") {
                        CompactSelect(
                            title: "Directions open in", selection: $directions,
                            options: ["Automatic", "Apple Maps", "Google Maps"], optionLabel: { $0 })
                    }
                    SwitchRow("Text the customer", detail: "When you're on your way", isOn: $textCustomer)
                    SwitchRow("Reminders", isOn: $reminders)
                    ListRow("Customers", chevron: true, icon: "person.2")
                }
                Grouped {
                    ActionRow("Sign Out", role: .destructive) {}
                }
            }
        }

        private var fields: some View {
            VStack(alignment: .leading, spacing: 16) {
                SectionHeading("Fields")
                OutlinedField(label: "Customer name", text: $name)
                OutlinedField(
                    label: "Email (optional)", text: $empty, placeholder: "name@example.com", hint: "For the report.")
                OutlinedField(
                    label: "Detection fee", text: $fee, error: "Enter an amount.", unit: "$", keyboard: .decimalPad,
                    numeric: true)
                OutlinedField(label: "Notes", text: $notes, placeholder: "What you saw", multiline: true)
                SelectField(
                    label: "Severity", selection: $severity, options: ["Minor", "Major", "Critical"],
                    optionLabel: { $0 })
                SearchField(text: $query, placeholder: "Customer name or job number")
                SearchField(text: $noQuery, placeholder: "Name, phone, or email")
                DateField(label: "Date", selection: $date, components: [.date, .hourAndMinute])
                HStack(spacing: 12) {
                    RoundCheck(done: false)
                    RoundCheck(done: true)
                }
            }
        }

        private var cards: some View {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 12) {
                    CardTitle("Homeowner report")
                    Text("One leak, at the skimmer seam.").textRole(.body).foregroundStyle(Color.text)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Lines").textRole(.subHeading).foregroundStyle(Color.text)
                        Text("Reseal skimmer seam · $250.00").textRole(.secondary).tabular()
                            .foregroundStyle(Color.textMuted)
                    }
                    .well()
                }
                .card()
            }
        }
    }

    /// Lays children left to right, wrapping to new lines (chips in the gallery).
    struct FlowRow: Layout {
        var spacing: CGFloat = 8

        func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
            let rows = arrange(proposal.width ?? .infinity, subviews)
            return CGSize(
                width: rows.map(\.width).max() ?? 0,
                height: rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(0, rows.count - 1)))
        }

        func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
            var y = bounds.minY
            for row in arrange(bounds.width, subviews) {
                var x = bounds.minX
                for index in row.items {
                    let size = Self.size(subviews[index], within: bounds.width)
                    subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                    x += size.width + spacing
                }
                y += row.height + spacing
            }
        }

        /// Its natural size, or, when that's wider than the row (a long button at a large text
        /// size), the row's width so it wraps instead of running off the screen.
        private static func size(_ subview: LayoutSubview, within width: CGFloat) -> CGSize {
            let ideal = subview.sizeThatFits(.unspecified)
            guard width.isFinite, ideal.width > width else { return ideal }
            return subview.sizeThatFits(ProposedViewSize(width: width, height: nil))
        }

        private func arrange(_ width: CGFloat, _ subviews: Subviews) -> [(
            items: [Int], width: CGFloat, height: CGFloat
        )] {
            var rows: [(items: [Int], width: CGFloat, height: CGFloat)] = []
            var current: (items: [Int], width: CGFloat, height: CGFloat) = ([], 0, 0)
            for index in subviews.indices {
                let size = Self.size(subviews[index], within: width)
                let needed = current.items.isEmpty ? size.width : current.width + spacing + size.width
                if needed > width && !current.items.isEmpty {
                    rows.append(current)
                    current = ([index], size.width, size.height)
                } else {
                    current = (current.items + [index], needed, max(current.height, size.height))
                }
            }
            if !current.items.isEmpty { rows.append(current) }
            return rows
        }
    }
#endif
