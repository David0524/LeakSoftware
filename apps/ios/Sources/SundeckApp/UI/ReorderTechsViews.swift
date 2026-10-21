#if os(iOS)
    import SundeckCore
    import SwiftUI

    // Reorder Techs (owner, 2026-10-21: "Make a way to reorder techs in the schedule";
    // docs/design/2026-10-21-tech-order.md), the website's reorder-techs.tsx: owners and admins
    // get "Reorder Techs" as a round button at the end of Whose schedule; its sheet lists the active techs as an inset
    // grouped list in edit mode, each with their color dot, Move Up and Move Down (the visible
    // alternative to dragging) and the system's reorder grip. Done saves (TechOrderWrites, through
    // the sync layer); Cancel leaves the order as it was.

    /// A round icon button at the end of the Whose schedule pills (owner, 2026-10-21: "shouldn't
    /// take up so much space… so it's not in its own row").
    struct ReorderTechsButton: View {
        var action: () -> Void

        var body: some View {
            RoundIconButton(systemImage: "arrow.up.arrow.down", label: ReorderTechs.action, action: action)
        }
    }

    struct ReorderTechsSheet: View {
        /// The active techs in the Schedule's order now.
        var techs: [TeamMember]
        /// Saves the order (membership ids, top to bottom); an error, or nil.
        var onSave: ([String]) -> String?
        @Environment(\.dismiss) private var dismiss
        @State private var list: [TeamMember] = []
        @State private var error: String?
        @State private var ready = false
        @State private var edit: EditMode = .active

        var body: some View {
            NavigationStack {
                List {
                    Section {
                        ForEach(Array(list.enumerated()), id: \.element.id) { i, t in
                            row(t, at: i)
                        }
                        .onMove { from, to in list.move(fromOffsets: from, toOffset: to) }
                    } footer: {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(ReorderTechs.help)
                            if let error {
                                Text(error).foregroundStyle(Color.fail)
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
                .background(Color.bg)
                .environment(\.editMode, $edit)
                .navigationTitle(ReorderTechs.title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(ReorderTechs.cancel) { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(ReorderTechs.done) {
                            if let failed = onSave(list.map(\.membershipId)) {
                                error = failed
                            } else {
                                dismiss()
                            }
                        }
                        .fontWeight(.semibold)
                    }
                }
            }
            .onAppear {
                guard !ready else { return }
                ready = true
                list = techs
            }
        }

        private func row(_ t: TeamMember, at i: Int) -> some View {
            HStack(spacing: 12) {
                TechDot(color: t.color)
                Text(t.name)
                    .textRole(.body)
                    .foregroundStyle(Color.text)
                    .lineLimit(1)
                Spacer(minLength: 8)
                arrow("arrow.up", "\(ReorderTechs.moveUp), \(t.name)", off: i == 0) { move(i, i - 1) }
                arrow("arrow.down", "\(ReorderTechs.moveDown), \(t.name)", off: i == list.count - 1) {
                    move(i, i + 1)
                }
            }
            .frame(minHeight: minTarget)
            .accessibilityElement(children: .contain)
            .accessibilityAction(named: ReorderTechs.moveUp) { move(i, i - 1) }
            .accessibilityAction(named: ReorderTechs.moveDown) { move(i, i + 1) }
        }

        private func arrow(_ symbol: String, _ label: String, off: Bool, _ action: @escaping () -> Void)
            -> some View
        {
            Button(action: action) {
                Image(systemName: symbol)
                    .font(.role(.bodyEmphasis))
                    .frame(width: minTarget, height: minTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.borderless)
            .foregroundStyle(off ? Color.textMuted : Color.link)
            .disabled(off)
            .accessibilityLabel(label)
        }

        private func move(_ from: Int, _ to: Int) {
            withAnimation { list = moveInList(list, from: from, to: to) }
        }
    }
#endif
