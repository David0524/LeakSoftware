#if os(iOS)
    import Foundation
    import SundeckCore
    import SundeckSync
    import SwiftUI
    import Testing

    @testable import SundeckApp

    // A visit's Chemicals (owner, 2026-10-24: "the actual reading, the aim for, the suggested
    // chemicals to add, and what was actually added"): each reading with its Aim For, Suggested and
    // Added, priced in a shop that charges for chemicals; one suggestion not added yet, chlorine
    // tabs added on their own; the Add Chemical and Added Chemical sheets; and the shop's Charge for
    // Chemicals switch and report timing in Settings.
    @Suite(.serialized) @MainActor struct ChemicalShots {
        /// The pool price book's chemicals (as the server seeds them), and Charge for Chemicals on.
        func seedChemicals(_ store: LocalStore, charge: Bool, reports: String = "manual") throws {
            func item(_ id: String, _ name: String, _ unit: String, _ cents: Int, _ chemical: String, _ order: Int)
                -> PulledRow
            {
                PulledRow(
                    table: "price_book_item", xid: "6",
                    row: [
                        "id": .string(id), "company_id": "c1", "name": .string(name), "unit": .string(unit),
                        "price_cents": .number(Double(cents)), "taxable": true, "sort_order": .number(Double(order)),
                        "active": true, "category": "Chemicals", "chemical": .string(chemical),
                    ])
            }
            try store.applyPage(
                PullPage(
                    rows: [
                        PulledRow(
                            table: "company", xid: "6",
                            row: [
                                "id": "c1", "company_id": "c1", "name": "Demo Leak Co.",
                                "timezone": "America/Phoenix",
                                "settings": [
                                    "services": "both", "charge_chemicals": .bool(charge),
                                    "visit_reports": .string(reports),
                                ],
                            ]),
                        item("chem-cl", "Liquid chlorine", "gal", 800, "liquid_chlorine", 110),
                        item("chem-acid", "Muriatic acid", "gal", 1500, "muriatic_acid", 120),
                        item("chem-tabs", "Chlorine tabs (3″)", "tab", 250, "tabs", 122),
                        item("chem-hypo", "Shock (cal-hypo)", "lb", 600, "cal_hypo", 124),
                        item("chem-cya", "Stabilizer (CYA)", "lb", 900, "stabilizer", 130),
                        item("chem-salt", "Salt, 40 lb bag", "bag", 1800, "salt", 140),
                        item("chem-soda", "Baking soda", "lb", 300, "baking_soda", 142),
                        item("chem-algae", "Algaecide", "qt", 1500, "algaecide", 152),
                    ], done: true, cursor: [:], serverHLC: "1760000000006-0000-srv"))
        }

        /// Sam's maintenance visit with today's readings typed and two suggestions and the tabs added.
        func seedVisit(_ env: AppEnvironment) throws -> ChemicalTarget {
            let store = env.session.sync.store
            let visit = try #require(try store.list("job").first { $0["number"] == 1043 })
            let pool = try #require(visit["property_id"]?.string)
            var form = ChemicalForm(gallons: 20000)
            form.readings = [.fc: "1", .ph: "7.8", .ta: "90", .ch: "260", .cya: "30"]
            form.goals = [.fc: "4", .cya: "40"]
            try VisitChemicalWrites.saveReading(
                env.session.sync, companyId: "c1", jobId: visit.id, propertyId: pool, form: form)
            let items = visitChemicalItems(store, companyId: "c1")
            let rows = chemicalRows(form.result, [], items).rows
            let fc = try #require(rows.first { $0.key == .fc }?.suggestion)
            let ph = try #require(rows.first { $0.key == .ph }?.suggestion)
            try VisitChemicalWrites.add(
                env.session.sync, companyId: "c1", jobId: visit.id, propertyId: pool, [fc, ph], firstSort: 0)
            let tabs = try #require(items.first { $0.chemical == "tabs" })
            try VisitChemicalWrites.add(
                env.session.sync, companyId: "c1", jobId: visit.id, propertyId: pool, [itemAddition(tabs, quantity: 3)],
                note: "In the floater", firstSort: 2)
            return ChemicalTarget(propertyId: pool, jobId: visit.id)
        }

        @Test func visitChemicals() async throws {
            let env = try sampleEnvironment()
            try seedChemicals(env.session.sync.store, charge: true)
            env.session.reloadCompanies()
            let target = try seedVisit(env)
            func card() -> some View {
                ScrollView { ChemicalCard(target: target, open: true).padding(16) }.background(Color.bg).app(env)
            }
            try await snapshot("48-visit-chemicals", height: 3000, card())
            try await snapshot("48-visit-chemicals-dark", dark: true, height: 3000, card())
            // Accessibility sizes stack each row: no columns, nothing truncated or hyphenated.
            try await snapshot("48-visit-chemicals-large-text", largeText: true, height: 8000, card())
            // On the visit's Checklist, where it lives.
            let visit = try #require(target.jobId)
            try await snapshot(
                "48-visit-chemicals-checklist", height: 2400,
                NavigationStack { JobScreen(jobId: visit, section: .checklist) }.app(env))
            // The sheets: Add Chemical with tabs picked, and an added chemical opened.
            let items = visitChemicalItems(env.session.sync.store, companyId: "c1")
            try await snapshot(
                "48-add-chemical-sheet", height: 1800,
                AddChemicalSheet(items: items, charges: true) { _, _, _ in }.app(env))
            let added = visitAdditions(env.session.sync.store, jobId: visit, items: items)
            let chlorine = try #require(added.first { $0.readingKey == .fc })
            try await snapshot(
                "48-added-chemical-sheet", height: 1400,
                AddedChemicalSheet(
                    target: .edit(chlorine), items: items, charges: true, onSave: { _ in }, onRemove: { _ in }
                )
                .app(env))
            try await snapshot(
                "48-added-chemical-sheet-large-text", largeText: true, height: 2400,
                AddedChemicalSheet(
                    target: .edit(chlorine), items: items, charges: true, onSave: { _ in }, onRemove: { _ in }
                )
                .app(env))
        }

        /// A shop that doesn't charge: no prices on the visit.
        @Test func visitChemicalsNotCharging() async throws {
            let env = try sampleEnvironment()
            try seedChemicals(env.session.sync.store, charge: false)
            env.session.reloadCompanies()
            let target = try seedVisit(env)
            try await snapshot(
                "48-visit-chemicals-no-prices", height: 3000,
                ScrollView { ChemicalCard(target: target, open: true).padding(16) }.background(Color.bg).app(env))
        }

        /// Settings: Price Book with Charge for Chemicals, and Report Templates' timing (Monthly).
        @Test func settings() async throws {
            let env = try sampleEnvironment()
            try seedChemicals(env.session.sync.store, charge: true, reports: "monthly")
            env.session.reloadCompanies()
            try await snapshot(
                "48-price-book-charge", height: 2200,
                NavigationStack { SettingsListScreen(page: .priceBook) }.app(env))
            try await snapshot(
                "48-report-timing-monthly", height: 1600,
                NavigationStack { ReportTemplatesScreen() }.app(env))
        }
    }
#endif
