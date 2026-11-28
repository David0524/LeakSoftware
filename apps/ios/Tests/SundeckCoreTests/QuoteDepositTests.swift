import Foundation
import SundeckCore
import Testing

/// quote-deposit.ts and settings-search.ts (owner, 2026-11-27): a quote's own deposit, and Search Settings.
@Suite struct QuoteDepositTests {
    let module = "quote-deposit"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "QUOTE_DEPOSIT_TEXT", "quoteDepositChoice", "depositRuleSummary", "quoteDepositLabel",
                "quoteDepositFromInput", "quoteDepositInputs", "SETTINGS_SEARCH", "SETTINGS_SEARCH_TEXT",
                "settingsNoResults", "searchSettings",
            ] as Set)
    }

    @Test func words() {
        checkRule(module, "QUOTE_DEPOSIT_TEXT") { _ -> [String: JSONValue] in
            [
                "row": .string(QuoteDepositText.row), "title": .string(QuoteDepositText.title),
                "choices": try JSONValue(encoding: labelTable { (c: QuoteDepositChoice) in c.label }),
                "shopDefault": .string(QuoteDepositText.shopDefault), "noDeposit": .string(QuoteDepositText.noDeposit),
                "percentLabel": .string(QuoteDepositText.percentLabel),
                "fixedLabel": .string(QuoteDepositText.fixedLabel), "save": .string(QuoteDepositText.save),
                "footer": .string(QuoteDepositText.footer),
            ]
        }
        checkRule(module, "SETTINGS_SEARCH") { _ in settingsSearch }
        checkRule(module, "SETTINGS_SEARCH_TEXT") { _ -> [String: String] in
            ["placeholder": SettingsSearchText.placeholder, "label": SettingsSearchText.label]
        }
        checkRule(module, "settingsNoResults") { c in settingsNoResults(try c.arg(0)) }
    }

    @Test func depositRules() {
        checkRule(module, "quoteDepositChoice") { c in
            quoteDepositChoice(try c.arg(0, as: DepositRule?.self)).rawValue
        }
        checkRule(module, "depositRuleSummary") { c in depositRuleSummary(try c.arg(0)) }
        checkRule(module, "quoteDepositLabel") { c in
            quoteDepositLabel(try c.arg(0, as: DepositRule?.self), try c.arg(1))
        }
        checkRule(module, "quoteDepositFromInput") { c -> [String: JSONValue] in
            let input = quoteDepositFromInput(try c.arg(0), percent: try c.arg(1), amount: try c.arg(2))
            switch input {
            case .rule(let rule): return ["rule": try rule.map { try JSONValue(encoding: $0) } ?? .null]
            case .error(let message): return ["error": .string(message)]
            }
        }
        checkRule(module, "quoteDepositInputs") { c -> [String: String] in
            let inputs = quoteDepositInputs(try c.arg(0, as: DepositRule?.self))
            return ["percent": inputs.percent, "amount": inputs.amount]
        }
        // The shop's rule wins only when the quote has none.
        let shop = DepositRule(type: .percent, valueBps: 5000)
        let own = DepositRule(type: .fixed, valueCents: 25000)
        #expect(quoteDepositRule(nil, shop) == shop)
        #expect(quoteDepositRule(own, shop) == own)
    }

    @Test func search() {
        checkRule(module, "searchSettings") { c in searchSettings(try c.arg(0), try c.arg(1)) }
        #expect(settingsSearchKeys.count == settingsSearch.count)
        #expect(Set(settingsSearchKeys) == Set(settingsSearch.keys))
    }
}
