#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Chemical on a visit's Checklist, opened in place (owner, 2026-10-19; website
    /// components/chem-dropdown.tsx). Closed: a card with "Chemical", the pool's last readings
    /// ("Last: FC 3 · pH 7.6 · Mon 8:15 AM") or "Add today’s readings", and a chevron. Open:
    /// Gallons, the readings with Aim For, Chlorine and Acid, What to Add right under them, then
    /// Submit to the pool's chemical log through the sync layer. The full Chemical screen stays
    /// for More and the customer's pool.
    struct ChemicalCard: View {
        var target: ChemicalTarget
        @Environment(SyncService.self) private var sync
        @Environment(Session.self) private var session
        @State private var open: Bool
        @State private var form = ChemicalForm()
        @State private var started = false
        @State private var submitResult: (text: String, error: Bool)?
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        /// `open` starts it open (screenshots).
        init(target: ChemicalTarget, open: Bool = false) {
            self.target = target
            _open = State(initialValue: open)
        }

        var body: some View {
            let _ = sync.revision  // the last readings update after Submit or a sync
            let pool = chemicalPool(sync.store, target)
            let line =
                session.company.map {
                    ChemicalCardText.line(
                        sync.store, companyId: $0.id, propertyId: target.propertyId, timeZone: $0.timeZone)
                } ?? ChemicalCardText.empty
            VStack(spacing: 0) {
                Button {
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { open.toggle() }
                } label: {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(ChemicalCardText.title).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                            Text(line)
                                .textRole(.secondary)
                                .monospacedDigit()
                                .foregroundStyle(Color.textMuted)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Color.textMuted)
                            .rotationEffect(.degrees(open ? 180 : 0))
                            .accessibilityHidden(true)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .frame(minHeight: 56)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.row)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
                .accessibilityValue(open ? "Expanded" : "Collapsed")
                .accessibilityHint(open ? "Folds the calculator" : "Opens the calculator")
                if open {
                    Hairline()
                    calculator(pool)
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                        .padding(.bottom, 20)
                }
            }
            .background(Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: CGFloat(Radius.grouped), style: .continuous))
            .onAppear {
                guard !started else { return }
                started = true
                form = ChemicalForm(
                    gallons: pool?.gallons,
                    goals: sync.kv.getJSON(KVKey.chemicalGoals, as: [String: String].self) ?? [:])
            }
            .onChange(of: form.storedGoals) { _, goals in sync.kv.setJSON(KVKey.chemicalGoals, goals) }
        }

        /// One column: Gallons, the readings, What to Add, then Submit.
        private func calculator(_ pool: ChemicalPool?) -> some View {
            VStack(alignment: .leading, spacing: 16) {
                OutlinedField(
                    label: "Gallons",
                    text: Binding(get: { form.gallons }, set: { form.gallons = gallonsWithCommas($0) }),
                    placeholder: "20,000", unit: "gal", keyboard: .numberPad
                )
                .frame(maxWidth: 320, alignment: .leading)
                ChemicalReadingInputs(form: $form)
                Hairline()
                VStack(alignment: .leading, spacing: 12) {
                    CardTitle(ChemicalCardText.whatToAdd)
                    if form.ready {
                        DoseList(result: form.result)
                    } else {
                        Text(ChemicalCardText.needsInput).textRole(.body).foregroundStyle(Color.textMuted)
                    }
                }
                Hairline()
                VStack(alignment: .leading, spacing: 12) {
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
    }
#endif
