#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SundeckTokens
    import SwiftUI

    /// The pool chemical calculator (spec 5.11; website components/chem-calculator.tsx, Expo
    /// chemicals.tsx; the math is SundeckCore/Chemistry.swift): the pool's size and today's
    /// readings in, what to add out, in order. What to Add is a bar floating above the tab bar
    /// that opens a sheet. Nothing is saved but the levels the tech aims for (on this phone).
    struct ChemicalsScreen: View {
        /// A visit opens it with the pool's gallons.
        var gallons: Double?
        @Environment(SyncService.self) private var sync
        @Environment(Session.self) private var session
        @Environment(AppEnvironment.self) private var app
        @State private var form = ChemicalForm()
        @State private var started = false
        @State private var showDoses = false

        var body: some View {
            let result = form.result
            let ready = form.ready
            ScreenScroll {
                if let company = session.company, let tip = screenTip("chemicals", company: company, app: app) {
                    TipCard(title: tip.title, message: tip.message) { app.walkthrough.dismiss(tip.id) }
                }
                VStack(alignment: .leading, spacing: 16) {
                    CardTitle("Pool")
                    OutlinedField(
                        label: "Gallons",
                        text: Binding(get: { form.gallons }, set: { form.gallons = gallonsWithCommas($0) }),
                        placeholder: "20,000", unit: "gal", keyboard: .numberPad
                    )
                    .frame(maxWidth: 320, alignment: .leading)
                }
                .card()
                readings
                    .card()
                // Room to scroll the last fields clear of the docked bar.
                Color.clear.frame(height: 56)
            }
            .navigationTitle("Chemical Calculator")
            .navigationBarTitleDisplayMode(.large)
            .safeAreaInset(edge: .bottom) {
                WhatToAddBar(summary: form.summary, ready: ready) { showDoses = true }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
            }
            .sheet(isPresented: $showDoses) {
                FormSheet(title: "What to Add", cancelTitle: "Close") { DoseList(result: result) }
            }
            .onAppear {
                guard !started else { return }
                started = true
                form = ChemicalForm(
                    gallons: gallons, goals: sync.kv.getJSON(KVKey.chemicalGoals, as: [String: String].self) ?? [:])
            }
            .onChange(of: form.storedGoals) { _, goals in sync.kv.setJSON(KVKey.chemicalGoals, goals) }
        }

        private var readings: some View {
            let recommended = form.recommended
            return VStack(alignment: .leading, spacing: 16) {
                CardTitle("Readings")
                Grid(alignment: .leading, horizontalSpacing: 8, verticalSpacing: 8) {
                    GridRow {
                        Color.clear.frame(height: 1)
                        columnLabel("Reading")
                        columnLabel("Aim For")
                    }
                    ForEach(chemicalReadingRows) { row in
                        GridRow {
                            (Text(row.label).font(.role(.bodyMedium)).foregroundStyle(Color.text)
                                + Text(row.unit.map { " \($0)" } ?? "").font(.role(.secondary)).foregroundStyle(
                                    Color.textMuted))
                                .frame(maxWidth: .infinity, alignment: .leading)
                            cell(
                                "\(row.label) reading",
                                Binding(get: { form.readings[row.key] ?? "" }, set: { form.readings[row.key] = $0 }))
                            cell(
                                "\(row.label): aim for (recommended \(levelText(recommended[row.key].target)))",
                                Binding(get: { form.goals[row.key] ?? "" }, set: { form.goals[row.key] = $0 }),
                                placeholder: levelText(recommended[row.key].target))
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text("Aim For starts at the recommended level. Type your own to dose to it.")
                        .textRole(.secondary)
                        .foregroundStyle(Color.textMuted)
                    if form.anyGoal {
                        Button("Use Recommended") { form.goals = [:] }
                            .font(.role(.bodyEmphasis))
                            .foregroundStyle(Color.link)
                            .frame(minHeight: minTarget)
                    }
                }
                SelectField(
                    label: "Chlorine", selection: $form.chlorine, options: ChlorineProduct.allCases,
                    optionLabel: \.label)
                SelectField(label: "Acid", selection: $form.acid, options: AcidProduct.allCases, optionLabel: \.label)
            }
        }

        private func columnLabel(_ text: String) -> some View {
            Text(text)
                .font(.role(.footnote).weight(.semibold))
                .textCase(.uppercase)
                .foregroundStyle(Color.textMuted)
                .frame(width: 80, alignment: .trailing)
                .accessibilityHidden(true)
        }

        private func cell(_ label: String, _ text: Binding<String>, placeholder: String = "") -> some View {
            TextField("", text: text, prompt: Text(placeholder).foregroundStyle(Color.placeholder))
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
                .accessibilityLabel(label)
                .fieldBox()
                .frame(width: 80)
        }
    }

    /// The floating bar: "WHAT TO ADD" over the first step in everyday words, and Show.
    struct WhatToAddBar: View {
        var summary: String
        var ready: Bool
        var open: () -> Void
        @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

        var body: some View {
            let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
            Button(action: open) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("What to Add")
                            .font(.role(.footnote).weight(.semibold))
                            .textCase(.uppercase)
                            .foregroundStyle(Color.textMuted)
                        Text(summary)
                            .font(.role(.bodyEmphasis))
                            .foregroundStyle(ready ? Color.text : Color.textMuted)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    if ready { Text("Show").font(.role(.bodyEmphasis)).foregroundStyle(Color.link) }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .frame(minHeight: 56)
                .contentShape(shape)
            }
            .buttonStyle(.plain)
            .disabled(!ready)
            .modifier(FloatingGlass(shape: shape, reduceTransparency: reduceTransparency))
            .accessibilityLabel("What to Add: \(summary)")
            .accessibilityHint(ready ? "Shows each step" : "")
        }
    }

    /// The readings as outlined pills, the steps in order, and the saturation index.
    struct DoseList: View {
        var result: ChemistryResult

        var body: some View {
            VStack(alignment: .leading, spacing: 16) {
                FlowRow {
                    ForEach(result.statuses, id: \.key) { s in
                        let tone = s.status == .ok ? Color.pass : Color.warning
                        Text(readingStatusText(s))
                            .font(.role(.secondary).weight(.semibold))
                            .foregroundStyle(tone)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(Color.surface))
                            .overlay(Capsule().strokeBorder(tone.opacity(0.4), lineWidth: 1))
                    }
                }
                if result.steps.isEmpty {
                    Text("Balanced. Nothing to add.").font(.role(.bodyEmphasis)).foregroundStyle(Color.pass)
                }
                ForEach(Array(result.steps.enumerated()), id: \.offset) { index, step in
                    HStack(alignment: .top, spacing: 12) {
                        Text("\(index + 1)")
                            .font(.custom(BrandFonts.Weight.bold.rawValue, size: 17, relativeTo: .headline))
                            .foregroundStyle(Color.onPrimary)
                            .frame(width: 28, height: 28)
                            .background(Circle().fill(Color.brandPrimary))
                            .accessibilityLabel("Step \(index + 1)")
                        VStack(alignment: .leading, spacing: 2) {
                            if let measure = step.measure {
                                Text(measure)
                                    .font(.custom(BrandFonts.Weight.extraBold.rawValue, size: 24, relativeTo: .title2))
                                    .foregroundStyle(Color.text)
                            }
                            Text(step.product).font(.role(.bodyEmphasis)).foregroundStyle(Color.text)
                            if let amount = step.amount {
                                Text("About \(amount)").textRole(.secondary).monospacedDigit().foregroundStyle(
                                    Color.textMuted)
                            }
                            Text(step.why).textRole(.secondary).foregroundStyle(Color.textMuted)
                            if let note = step.note { Text(note).textRole(.secondary).foregroundStyle(Color.text) }
                        }
                    }
                    .well()
                    .accessibilityElement(children: .combine)
                }
                if let line = saturationText(result) {
                    Text(line).textRole(.secondary).monospacedDigit().foregroundStyle(Color.text)
                }
            }
        }
    }

    /// The What to Add bar's surface: interactive Liquid Glass on iOS 26 (it handles Reduce
    /// Transparency itself); the material with a border and shadow before.
    private struct FloatingGlass<S: InsettableShape>: ViewModifier {
        var shape: S
        var reduceTransparency: Bool

        func body(content: Content) -> some View {
            if #available(iOS 26, *) {
                content.glassSurface(shape, interactive: true)
            } else {
                content
                    .background {
                        if reduceTransparency { shape.fill(Color.surface) } else { shape.fill(.regularMaterial) }
                    }
                    .overlay(shape.strokeBorder(Color.text.opacity(0.1), lineWidth: 1))
                    .shadow(color: Color.navy.opacity(0.14), radius: 14, x: 0, y: 8)
            }
        }
    }
#endif
