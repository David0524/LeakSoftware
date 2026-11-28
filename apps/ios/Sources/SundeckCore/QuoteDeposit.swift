import Foundation

// A quote's own deposit (owner, 2026-11-27: "Allow the owner to adjust the deposit settings
// within the quote/invoice pages"; chose "Change it per quote"). Port of
// packages/core/src/quote-deposit.ts. Owners and admins set it on a draft quote: the shop's
// default (Settings › Payments and Deposits), a percent, a fixed amount, or no deposit. Stored as
// quote.deposit_rule (null = the shop's default); send_quote freezes it. The same on the website,
// iPhone and Android. No I/O.

/// The four choices on the Deposit sheet.
public enum QuoteDepositChoice: String, Codable, CaseIterable, Sendable {
    case shopDefault = "default"
    case percent
    case fixed
    case noDeposit = "none"

    public var label: String {
        switch self {
        case .shopDefault: QuoteDepositText.choiceDefault
        case .percent: QuoteDepositText.choicePercent
        case .fixed: QuoteDepositText.choiceFixed
        case .noDeposit: QuoteDepositText.choiceNone
        }
    }
}

/// `QUOTE_DEPOSIT_TEXT`: the Deposit row and sheet's words.
public enum QuoteDepositText {
    public static let row = "Deposit"
    public static let title = "Deposit for This Quote"
    /// The segmented control's labels: short, so four fit a phone.
    public static let choiceDefault = "Default"
    public static let choicePercent = "Percent"
    public static let choiceFixed = "Amount"
    public static let choiceNone = "None"
    /// The Deposit row's words for the shop's default and for none.
    public static let shopDefault = "Shop Default"
    public static let noDeposit = "No Deposit"
    public static let percentLabel = "Percent of total"
    public static let fixedLabel = "Amount"
    public static let save = "Save"
    public static let footer = "For this quote only. Change the shop’s default in Settings › Payments and Deposits."
}

/// The deposit a quote asks for: its own rule, else the shop's.
public func quoteDepositRule(_ quoteRule: DepositRule?, _ shopRule: DepositRule) -> DepositRule {
    quoteRule ?? shopRule
}

/// Which choice a quote's stored rule is.
public func quoteDepositChoice(_ quoteRule: DepositRule?) -> QuoteDepositChoice {
    guard let rule = quoteRule else { return .shopDefault }
    if rule.type == .fixed { return (rule.valueCents ?? 0) > 0 ? .fixed : .noDeposit }
    return (rule.valueBps ?? 0) > 0 || (rule.minimumCents ?? 0) > 0 ? .percent : .noDeposit
}

/// A rule in a few words: "50%", "50%, at least $100.00", "$250.00", "None".
public func depositRuleSummary(_ rule: DepositRule) -> String {
    if quoteDepositChoice(rule) == .noDeposit { return "None" }
    if rule.type == .fixed { return formatCents(rule.valueCents ?? 0) }
    let pct = "\(ECMA.numberString(Double(rule.valueBps ?? 0) / 100))%"
    if let minimum = rule.minimumCents, minimum != 0 { return "\(pct), at least \(formatCents(minimum))" }
    return pct
}

/// The Deposit row's value: "Shop Default (50%)", "30%", "$250.00", "No Deposit".
public func quoteDepositLabel(_ quoteRule: DepositRule?, _ shopRule: DepositRule) -> String {
    switch quoteDepositChoice(quoteRule) {
    case .shopDefault: "\(QuoteDepositText.shopDefault) (\(depositRuleSummary(shopRule)))"
    case .noDeposit: QuoteDepositText.noDeposit
    case .percent, .fixed: depositRuleSummary(quoteRule ?? shopRule)
    }
}

/// The rule to store for a choice (nil = the shop's default), or an error to show.
public enum QuoteDepositInput: Equatable, Sendable {
    case rule(DepositRule?)
    case error(String)
}

/// The rule to store for a choice, or an error to show. `percent` is what was typed ("30"),
/// `amount` dollars ("250" or "250.00").
public func quoteDepositFromInput(_ choice: QuoteDepositChoice, percent: String, amount: String) -> QuoteDepositInput {
    switch choice {
    case .shopDefault:
        return .rule(nil)
    case .noDeposit:
        return .rule(DepositRule(type: .percent, valueBps: 0, minimumCents: 0))
    case .percent:
        var text = ECMA.trim(percent)
        if text.hasSuffix("%") { text.removeLast() }
        let p = ECMA.number(text)
        if !p.isFinite || p <= 0 || p > 100 { return .error("Enter a percent from 1 to 100.") }
        return .rule(DepositRule(type: .percent, valueBps: Int(ECMA.round(p * 100)), minimumCents: 0))
    case .fixed:
        let dollars = ECMA.number(String(ECMA.trim(amount).filter { $0 != "$" && $0 != "," }))
        // Past `maxEnteredCents` (which TypeScript lets through for the database to refuse) is
        // refused here, so the cents always fit an Int.
        if !dollars.isFinite || dollars <= 0 || dollars * 100 > Double(maxEnteredCents) {
            return .error("Enter an amount, like 250.")
        }
        return .rule(DepositRule(type: .fixed, valueCents: Int(ECMA.round(dollars * 100)), minimumCents: 0))
    }
}

/// The fields' starting text for a stored rule: ("30", "") or ("", "250.00").
public func quoteDepositInputs(_ quoteRule: DepositRule?) -> (percent: String, amount: String) {
    switch quoteDepositChoice(quoteRule) {
    case .percent: (ECMA.numberString(Double(quoteRule?.valueBps ?? 0) / 100), "")
    case .fixed: ("", ECMA.toFixed(Double(quoteRule?.valueCents ?? 0) / 100, 2))
    case .shopDefault, .noDeposit: ("", "")
    }
}
