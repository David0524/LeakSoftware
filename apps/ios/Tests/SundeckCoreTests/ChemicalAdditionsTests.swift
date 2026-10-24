import Foundation
import SundeckCore
import Testing

/// chemical-additions: a visit's added chemicals, their totals, and the report's lines (owner,
/// 2026-10-24).
@Suite struct ChemicalAdditionsTests {
    let module = "chemical-additions"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "CHEMICAL_KEYS", "UNIT_STEPS", "CHARGE_CHEMICALS_TEXT", "gallonQuantity", "dryQuantity",
                "formatQuantity", "additionLabel", "unitPriceLabel", "stepQuantity", "convertQuantity",
                "chargesChemicals", "chargeChemicalsSettings", "chemicalItems", "itemForChemical", "suggestionText",
                "suggestedAddition", "itemAddition", "chemicalRows", "openSuggestions", "additionsCents",
                "chemicalCardLine", "chemicalTotals", "monthName", "monthlyUsage", "reportAddedRows",
                "reportAddedTotal",
            ])
    }

    /// The fixtures' price book items (the same in fixtures/cases/chemical-additions.ts).
    private func items() throws -> [ChemicalItem] {
        // chemicalItems' cases carry no arguments: the items come from the suggestedAddition case's
        // module constant, so rebuild them from itemForChemical's expectations instead.
        let rows: [(String, String, String, Int, String?, String?, Double, Bool, String?)] = [
            ("cl", "Liquid chlorine", "gal", 800, "Chemicals", "liquid_chlorine", 110, true, nil),
            ("acid", "Muriatic acid", "gal", 1500, "Chemicals", "muriatic_acid", 120, true, nil),
            ("tabs", "Chlorine tabs (3″)", "tab", 250, "Chemicals", "tabs", 122, true, nil),
            ("hypo", "Shock (cal-hypo)", "lb", 600, "Chemicals", "cal_hypo", 124, true, nil),
            ("cya", "Stabilizer (CYA)", "lb", 900, "Chemicals", "stabilizer", 130, true, nil),
            ("salt", "Salt, 40 lb bag", "bag", 1800, "Chemicals", "salt", 140, true, nil),
            ("soda", "Baking soda", "lb", 300, "Chemicals", "baking_soda", 142, true, nil),
            ("ash", "Soda ash", "oz", 30, "Chemicals", "soda_ash", 144, true, nil),
            ("jug", "Calcium, jug", "jug", 2000, "Chemicals", "calcium_chloride", 146, true, nil),
            ("algae", "Algaecide", "qt", 1500, "Chemicals", "algaecide", 152, true, nil),
            ("old", "Old chlorine", "gal", 500, "Chemicals", "liquid_chlorine", 100, false, nil),
            ("gone", "Gone acid", "gal", 500, "Chemicals", "muriatic_acid", 90, true, "2026-10-01T00:00:00Z"),
            ("rem", "Removed tabs", "tab", 100, nil, "tabs", 300, true, nil),
            ("pump", "Replace pump motor", "each", 65000, "Repair", nil, 210, true, nil),
        ]
        return rows.map {
            ChemicalItem(
                id: $0.0, name: $0.1, unit: $0.2, priceCents: $0.3, category: $0.4, chemical: $0.5, sortOrder: $0.6,
                active: $0.7, deletedAt: $0.8)
        }
    }

    @Test func constants() {
        checkRule(module, "CHEMICAL_KEYS") { _ in chemicalKeys }
        checkRule(module, "UNIT_STEPS") { _ in unitSteps }
        checkRule(module, "CHARGE_CHEMICALS_TEXT") { _ in ChargeChemicalsText.all }
        checkRule(module, "chargesChemicals") { c in chargesChemicals(try c.arg(0, as: JSONValue?.self)) }
        checkRule(module, "chargeChemicalsSettings") { c in
            chargeChemicalsSettings(try c.arg(0), today: try c.arg(1))
        }
    }

    @Test func amounts() {
        checkRule(module, "gallonQuantity") { c in gallonQuantity(try c.arg(0)) }
        checkRule(module, "dryQuantity") { c in dryQuantity(try c.arg(0), try c.arg(1, as: Double?.self)) }
        checkRule(module, "formatQuantity") { c in formatQuantity(try c.arg(0), unit: try c.arg(1)) }
        checkRule(module, "additionLabel") { c in
            additionLabel(quantity: try c.arg(0), unit: try c.arg(1), name: try c.arg(2))
        }
        checkRule(module, "unitPriceLabel") { c in unitPriceLabel(try c.arg(0), unit: try c.arg(1)) }
        checkRule(module, "stepQuantity") { c in
            stepQuantity(try c.arg(0), unit: try c.arg(1), direction: try c.arg(2))
        }
        checkRule(module, "convertQuantity") { c in
            convertQuantity(try c.arg(0), from: try c.arg(1), to: try c.arg(2))
        }
    }

    @Test func suggestions() throws {
        let items = try items()
        checkRule(module, "chemicalItems") { _ in chemicalItems(items).map(\.id) }
        checkRule(module, "itemForChemical") { c in itemForChemical(items, try c.arg(0, as: String?.self))?.id }
        checkRule(module, "suggestionText") { c in
            calculateChemistry(try c.arg(0, as: ChemistryInput.self)).steps.map(suggestionText)
        }
        checkRule(module, "suggestedAddition") { c in
            let withItems: Bool = try c.arg(1)
            return calculateChemistry(try c.arg(0, as: ChemistryInput.self)).steps.map {
                suggestedAddition($0, withItems ? items : [])
            }
        }
        checkRule(module, "itemAddition") { c in
            let id: String = try c.arg(0)
            return itemAddition(items.first { $0.id == id }!, quantity: try c.arg(1, as: Double?.self))
        }
    }

    @Test func rows() throws {
        let items = try items()
        let visitAdds = try Fixtures.cases(module, "additionsCents")[0].arg(0, as: [ChemicalAddition].self)
        checkRule(module, "chemicalRows") { c in
            chemicalRows(calculateChemistry(try c.arg(0, as: ChemistryInput.self)), visitAdds, items)
        }
        checkRule(module, "openSuggestions") { c in
            let none: Bool = try c.arg(1)
            return openSuggestions(
                chemicalRows(calculateChemistry(try c.arg(0, as: ChemistryInput.self)), none ? [] : visitAdds, items)
                    .rows)
        }
        checkRule(module, "additionsCents") { c in additionsCents(try c.arg(0)) }
        checkRule(module, "chemicalCardLine") { c in chemicalCardLine(try c.arg(0), try c.arg(1)) }
    }

    @Test func totals() {
        checkRule(module, "chemicalTotals") { c in chemicalTotals(try c.arg(0)) }
        checkRule(module, "monthName") { c in monthName(try c.arg(0), timeZone: try c.arg(1)) }
        checkRule(module, "monthlyUsage") { c in
            monthlyUsage(try c.arg(0), timeZone: try c.arg(1), months: try c.arg(2, as: Int?.self) ?? 3)
        }
    }

    @Test func report() throws {
        let added = try Fixtures.cases(module, "reportAddedRows")
        #expect(!added.isEmpty)
        // The report's added chemicals are a module constant in the cases; the first row of each
        // expected result names them, so rebuild the list the TypeScript cases use.
        let adds: [ReportAddition] = try JSONValue.array([
            [
                "name": "Liquid chlorine", "unit": "gal", "quantity": 0.5, "reading_key": "fc", "note": nil,
                "customer_supplied": false, "unit_price_cents": 800,
            ],
            [
                "name": "Muriatic acid", "unit": "gal", "quantity": 0.25, "reading_key": "ph", "note": nil,
                "customer_supplied": false, "unit_price_cents": 1500,
            ],
            [
                "name": "Baking soda", "unit": "lb", "quantity": 2, "reading_key": "ta", "note": nil,
                "customer_supplied": false, "unit_price_cents": 300,
            ],
            [
                "name": "Chlorine tabs", "unit": "tab", "quantity": 3, "reading_key": nil, "note": "In the floater",
                "customer_supplied": false, "unit_price_cents": 250,
            ],
            [
                "name": "Algaecide", "unit": "qt", "quantity": 1, "reading_key": nil, "note": nil,
                "customer_supplied": true, "unit_price_cents": 1500,
            ],
            [
                "name": "Stabilizer", "unit": "lb", "quantity": 1.5, "reading_key": "cya", "note": " ",
                "customer_supplied": false, "unit_price_cents": 900,
            ],
            [
                "name": "Salt", "unit": "bag", "quantity": 1, "reading_key": "salt", "note": nil,
                "customer_supplied": false, "unit_price_cents": 1800,
            ],
        ]).decode()
        checkRule(module, "reportAddedRows") { c in
            reportAddedRows(
                adds, reading: try c.arg(0, as: Readings?.self), goals: try c.arg(1, as: Readings?.self),
                charged: try c.arg(2))
        }
        checkRule(module, "reportAddedTotal") { c in
            let none: Bool = try c.arg(1)
            return reportAddedTotal(none ? [] : adds, charged: try c.arg(0))
        }
    }
}
