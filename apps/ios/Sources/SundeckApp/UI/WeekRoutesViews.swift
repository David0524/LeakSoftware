#if os(iOS)
    import SundeckCore
    import SwiftUI

    // Week's routes work (owner, 2026-10-20; docs/design/2026-10-20-team-week.md sections 6 and
    // 8): Customers to Add (running plans with nobody on them) above the board as a tray, each
    // tile dragged whole onto a tech's day, or tapped for its Move sheet; Suggest Days, and the
    // suggestions waiting for Keep. Website components/service-routes.tsx.

    /// Customers to Add: a sideways row of tiles, newest first, with Suggest Days.
    struct CustomersToAddCard: View {
        var plans: [RoutePlanCard]
        /// Suggest Days is working.
        var busy = false
        var onMove: (RoutePlanCard) -> Void
        var onSuggest: () -> Void

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .center, spacing: 8) {
                    CardTitle("Customers to Add" + (plans.isEmpty ? "" : " (\(plans.count))"))
                    Spacer(minLength: 0)
                    if !plans.isEmpty {
                        Button(action: onSuggest) {
                            BusyLabel(title: "Suggest Days", busyTitle: "Suggesting…", busy: busy)
                        }
                        .buttonStyle(.quiet(size: .small))
                        .disabled(busy)
                        .accessibilityHint("Puts each on a day near its neighbors")
                    }
                }
                if plans.isEmpty {
                    Text("Every customer has a day.").textRole(.secondary).foregroundStyle(Color.textMuted)
                } else {
                    GeometryReader { geo in
                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(spacing: 12) {
                                ForEach(plans) { p in
                                    PlanTile(plan: p) { onMove(p) }
                                        .frame(width: geo.size.width * 0.85)
                                }
                            }
                            .scrollTargetLayout()
                        }
                        .scrollTargetBehavior(.viewAligned)
                    }
                    .frame(height: 76)
                    Text("Drag a customer onto a tech’s day, or tap one to pick its day.")
                        .textRole(.footnote).foregroundStyle(Color.textMuted)
                }
            }
            .card(padding: 16)
        }
    }

    /// A plan waiting for a day: the customer, the address and how often. The whole tile is the
    /// drag handle, grip included (owner, 2026-10-20: "you should be able to drag the entire
    /// tile"); a tap opens its Move sheet.
    struct PlanTile: View {
        var plan: RoutePlanCard
        var onMove: () -> Void
        @State private var picked = 0

        var body: some View {
            Button(action: onMove) {
                HStack(spacing: 4) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(plan.customer).textRole(.bodyEmphasis).foregroundStyle(Color.text).lineLimit(1)
                        Text(detail).textRole(.secondary).foregroundStyle(Color.textMuted).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    DragGrip(width: 24)
                }
                .well(padding: 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .onDrag {
                picked += 1
                return NSItemProvider(object: planDragItem(plan.planId) as NSString)
            } preview: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(plan.customer).textRole(.bodyEmphasis).foregroundStyle(Color.text).lineLimit(1)
                    if !plan.address.isEmpty {
                        Text(plan.address).textRole(.secondary).foregroundStyle(Color.textMuted).lineLimit(1)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(width: 280, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: CGFloat(Radius.block), style: .continuous).fill(Color.surface))
            }
            .sensoryFeedback(.impact(weight: .medium), trigger: picked)
            .accessibilityLabel([plan.customer, detail].filter { !$0.isEmpty }.joined(separator: ", "))
            .accessibilityHint("Opens Move. Or touch and hold to drag it onto a tech’s day.")
        }

        private var detail: String {
            [plan.address.isEmpty ? nil : plan.address, plan.repeatNote].compactMap { $0 }.joined(separator: " · ")
        }
    }

    /// Move {Customer} for a plan (website service-routes.tsx `MoveSheet`): the Tech and the
    /// Day of the week; its coming visits follow.
    struct PlanMoveSheet: View {
        var target: PlanMoveTarget
        var board: Board
        var onMove: (_ day: Int, _ tech: String) -> Void
        @Environment(\.dismiss) private var dismiss
        @State private var tech: String?
        @State private var day = 1
        @State private var ready = false

        private var techs: [TeamMember] { board.team.filter(\.active) }
        /// The shop's working days first (Monday first), then the rest of the week.
        private var days: [Int] {
            let week = [1, 2, 3, 4, 5, 6, 0]
            return week.filter { board.ctx.settings.workDays.contains($0) }
                + week.filter { !board.ctx.settings.workDays.contains($0) }
        }
        private var techLabel: String { tech.flatMap { id in techs.first { $0.id == id }?.name } ?? "Pick a Tech" }

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(spacing: 24) {
                        if !target.plan.address.isEmpty {
                            Text(target.plan.address).textRole(.secondary).foregroundStyle(Color.textMuted)
                                .multilineTextAlignment(.center)
                        }
                        VStack(alignment: .leading, spacing: 8) {
                            Grouped {
                                ListRow("Tech") {
                                    Menu {
                                        Picker("Tech", selection: $tech) {
                                            ForEach(techs) { m in
                                                Label {
                                                    Text(m.name)
                                                } icon: {
                                                    m.color.menuImage
                                                }.tag(Optional(m.id))
                                            }
                                        }
                                        .pickerStyle(.inline)
                                    } label: {
                                        HStack(spacing: 8) {
                                            if let color = board.color(tech) { TechDot(color: color) }
                                            MenuValue(text: techLabel)
                                        }
                                    }
                                    .accessibilityLabel("Tech")
                                    .accessibilityValue(techLabel)
                                }
                                ListRow("Day") {
                                    Menu {
                                        Picker("Day", selection: $day) {
                                            ForEach(days, id: \.self) { Text(weekdayNames[$0]).tag($0) }
                                        }
                                        .pickerStyle(.inline)
                                    } label: {
                                        MenuValue(text: weekdayNames[day])
                                    }
                                    .accessibilityLabel("Day")
                                    .accessibilityValue(weekdayNames[day])
                                }
                            }
                            Text("Its coming visits move to the new day.")
                                .textRole(.footnote).foregroundStyle(Color.textMuted)
                                .padding(.horizontal, 16)
                        }
                        Button("Move") { if let tech { onMove(day, tech) } }
                            .buttonStyle(.primary(fullWidth: true, size: .field))
                            .disabled(tech == nil)
                    }
                    .padding(16)
                }
                .background(Color.bg)
                .navigationTitle("Move \(target.plan.customer)")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                }
            }
            .sheetPresentation(detents: [.medium, .large])
            .onAppear {
                guard !ready else { return }
                ready = true
                let shown = board.shownTechs.filter(\.active)
                tech =
                    target.plan.techId.flatMap { id in techs.contains { $0.id == id } ? id : nil }
                    ?? (shown.count == 1 ? shown[0].id : nil) ?? (techs.count == 1 ? techs[0].id : nil)
                day = target.day ?? target.plan.days.first ?? days.first ?? 1
            }
        }
    }

    /// Suggest Days' results: each customer with the day and tech suggested, why any were left
    /// out, and Keep (nothing is saved until then).
    struct SuggestedDaysSheet: View {
        var found: SuggestedDays
        var board: Board
        var onKeep: () -> Void
        @Environment(\.dismiss) private var dismiss

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if let note = found.note {
                            Text(note).textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                        Grouped {
                            ForEach(found.suggestions, id: \.id) { s in
                                let plan = board.plans.first { $0.planId == s.id }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(plan?.customer ?? "Customer").textRole(.body).foregroundStyle(Color.text)
                                    HStack(spacing: 8) {
                                        if let color = board.color(s.techId) { TechDot(color: color) }
                                        Text("\(weekdayNames[s.day]) · \(board.name(s.techId))")
                                            .textRole(.secondary).foregroundStyle(Color.textMuted)
                                    }
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
                                .accessibilityElement(children: .combine)
                            }
                        }
                        Button("Keep") { onKeep() }
                            .buttonStyle(.primary(fullWidth: true, size: .field))
                    }
                    .padding(16)
                }
                .background(Color.bg)
                .navigationTitle("\(found.suggestions.count) Suggested")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                }
            }
            .sheetPresentation(detents: [.medium, .large])
        }
    }
#endif
