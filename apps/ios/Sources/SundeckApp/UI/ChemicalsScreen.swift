#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SundeckTokens
    import SwiftUI

    /// Chemical (spec 5.11; website components/chem-calculator.tsx and app/(office)/chemicals,
    /// Expo chemicals.tsx; the math is SundeckCore/Chemistry.swift): the pool's size and today's
    /// readings in, what to add out, in order. What to Add is a bar floating above the tab bar
    /// that opens a sheet. Opened for a pool (from a visit or a customer's pool), its gallons fill
    /// in, Submit saves the readings to the pool's chemical log (a synced row, so it works
    /// offline), and the log is listed below (owner, 2026-10-19).
    struct ChemicalsScreen: View {
        /// The pool (and visit) it was opened for; nil from More.
        var target: ChemicalTarget?
        /// Gallons to start from when the pool has none.
        var gallons: Double?
        @Environment(SyncService.self) private var sync
        @Environment(Session.self) private var session
        @Environment(AppEnvironment.self) private var app
        @State private var form = ChemicalForm()
        @State private var started = false
        @State private var showDoses = false
        @State private var submitResult: (text: String, error: Bool)?
        @State private var removing: ChemicalLogEntry?

        var body: some View {
            let _ = sync.revision  // the log reloads after any write or pull
            let result = form.result
            let ready = form.ready
            let pool = target.flatMap { chemicalPool(sync.store, $0) }
            ScreenScroll {
                if let pool { PageHeader(subtitle: pool.subtitle) }
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
                readings(pool)
                    .card()
                if let pool { log(pool) }
                // Room to scroll the last fields clear of the docked bar.
                Color.clear.frame(height: 56)
            }
            .navigationTitle("Chemical")
            .navigationBarTitleDisplayMode(.large)
            .safeAreaInset(edge: .bottom) {
                WhatToAddBar(summary: form.summary, ready: ready) { showDoses = true }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
            }
            .sheet(isPresented: $showDoses) {
                FormSheet(title: "What to Add", cancelTitle: "Close") { DoseList(result: result) }
            }
            .confirmationDialog(
                ChemicalLogText.removeTitle,
                isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                titleVisibility: .visible, presenting: removing
            ) { entry in
                Button(ChemicalLogText.removeButton, role: .destructive) { remove(entry) }
            } message: { _ in
                Text(ChemicalLogText.removeMessage)
            }
            .onAppear {
                guard !started else { return }
                started = true
                form = ChemicalForm(
                    gallons: pool?.gallons ?? gallons,
                    goals: sync.kv.getJSON(KVKey.chemicalGoals, as: [String: String].self) ?? [:])
            }
            .onChange(of: form.storedGoals) { _, goals in sync.kv.setJSON(KVKey.chemicalGoals, goals) }
        }

        /// Submit, at the end of the Readings card: the left side goes into the pool's log.
        @ViewBuilder private func submit(_ pool: ChemicalPool?) -> some View {
            VStack(alignment: .leading, spacing: 12) {
                Hairline()
                if let pool {
                    Button("Submit") { save(pool) }
                        .buttonStyle(.primary(fullWidth: true, size: .field))
                        .disabled(form.result.statuses.isEmpty)
                    Text(ChemicalLogText.submitHint(pool)).textRole(.secondary).foregroundStyle(Color.textMuted)
                    if let submitResult {
                        Notice(kind: submitResult.error ? .error : .success, text: submitResult.text)
                    }
                } else {
                    Text(ChemicalLogText.noPool).textRole(.secondary).foregroundStyle(Color.textMuted)
                }
            }
        }

        /// The pool's chemical log, newest first, each entry with Remove.
        private func log(_ pool: ChemicalPool) -> some View {
            let entries =
                session.company.map {
                    chemicalLog(
                        sync.store, companyId: $0.id, propertyId: pool.propertyId, names: teamNames(sync.kv),
                        timeZone: $0.timeZone)
                } ?? []
            return Grouped(label: ChemicalLogText.logTitle, footer: ChemicalLogText.logFooter) {
                if entries.isEmpty {
                    ListRow(ChemicalLogText.logEmpty).foregroundStyle(Color.textMuted)
                }
                ForEach(entries) { entry in
                    ListRow(entry.summary, detail: entry.detail.isEmpty ? nil : entry.detail) {
                        Button("Remove") { removing = entry }
                            .font(.role(.secondary))
                            .foregroundStyle(Color.fail)
                            .frame(minWidth: minTarget, minHeight: minTarget)
                            .contentShape(Rectangle())
                            .buttonStyle(.plain)
                            .accessibilityLabel("Remove these readings")
                    }
                    .monospacedDigit()
                }
            }
        }

        private func save(_ pool: ChemicalPool) {
            guard let companyId = session.company?.id else { return }
            do {
                try ChemicalLogWrites.submit(sync, companyId: companyId, pool: pool, form: form)
                submitResult = (ChemicalLogText.submitted, false)
            } catch let error as ChemicalSubmitError {
                submitResult = (error.message, true)
            } catch {
                submitResult = (String(describing: error), true)
            }
        }

        private func remove(_ entry: ChemicalLogEntry) {
            removing = nil
            do {
                try ChemicalLogWrites.remove(sync, readingId: entry.id)
            } catch {
                submitResult = (String(describing: error), true)
            }
        }

        private func readings(_ pool: ChemicalPool?) -> some View {
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
                submit(pool)
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
        @Environment(\.drawsGlass) private var drawsGlass

        func body(content: Content) -> some View {
            if usesGlass(drawsGlass) {
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
