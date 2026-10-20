#if os(iOS)
    import SundeckCore
    import SwiftUI

    // Plan Week (owner, 2026-10-20, docs/plans/route-maps.md; the website's components/plan-week.tsx):
    // who to plan for, whether jobs nobody has yet come onto the week, one line on what stays put,
    // and the button. No confirmation: the result has Undo (undo-and-redo.md).

    /// Plan Week's sheet: "Plan for" as an iOS checklist with checkmarks (owner, 2026-10-20:
    /// "select multiple techs when planning a week. Then it should split the open jobs up evenly"):
    /// Everyone selects or clears every tech, then a row per tech; at least
    /// one is needed, else Plan Week is dimmed. Then the Needs a Time switch when jobs are waiting,
    /// the footnote and the prominent Plan Week.
    struct PlanWeekSheet: View {
        var board: Board
        /// The techs picked, and whether to place jobs from Needs a Time.
        var onPlan: (_ techs: [String], _ tray: Bool) -> Void
        @Environment(\.dismiss) private var dismiss
        @State private var picked: [String] = []
        @State private var withTray = true
        @State private var ready = false

        private var techs: [TeamMember] { planWeekTechs(board.team, ctx: board.ctx) }
        private var waiting: Int {
            planWeekWaiting(
                board.tray, dates: planWeekDates(board.days, today: board.ctx.today), timeZone: board.ctx.timeZone)
        }

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        VStack(alignment: .leading, spacing: 16) {
                            Grouped(label: "Plan for") {
                                if techs.count > 1 { choice("all", "Everyone", on: picked.count == techs.count) }
                                ForEach(techs) { t in choice(t.id, t.name, on: picked.contains(t.id)) }
                            }
                            .accessibilityValue(planForLabel(picked, techs: techs))
                        }
                        VStack(alignment: .leading, spacing: 8) {
                            if waiting > 0 {
                                Grouped {
                                    SwitchRow(
                                        "Place Jobs from Needs a Time", detail: "\(waiting) waiting", isOn: $withTray)
                                }
                            }
                            Text(planWeekHelp)
                                .textRole(.footnote)
                                .foregroundStyle(Color.textMuted)
                                .padding(.horizontal, 16)
                        }
                        Button("Plan Week") { onPlan(picked, waiting > 0 && withTray) }
                            .buttonStyle(.primary(fullWidth: true, size: .field))
                            .disabled(picked.isEmpty)
                    }
                    .padding(16)
                }
                .background(Color.bg)
                .navigationTitle("Plan Week")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                }
            }
            .sheetPresentation(detents: [.medium, .large])
            .onAppear {
                guard !ready else { return }
                ready = true
                // The sheet starts from the tech the schedule shows, else Everyone.
                picked = techs.contains { $0.id == board.tech } ? [board.tech] : techs.map(\.id)
            }
        }

        /// A row of the checklist: a tech's name (or Everyone), and a check when on.
        private func choice(_ id: String, _ name: String, on: Bool) -> some View {
            Button {
                withAnimation(Motion.snappy) { picked = togglePlanTech(picked, id, techs: techs) }
            } label: {
                ListRow(name) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.link)
                        .opacity(on ? 1 : 0)
                        .accessibilityHidden(true)
                }
            }
            .buttonStyle(.row)
            .accessibilityAddTraits(on ? .isSelected : [])
        }
    }
#endif
