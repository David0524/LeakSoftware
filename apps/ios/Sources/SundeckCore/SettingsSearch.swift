import Foundation

// Search Settings (owner, 2026-11-27: "Add a search to the settings page"): a search field at
// the top of Settings, as iOS Settings has. It finds a page by its name or by a setting on it
// ("deposit" finds Payments and Deposits), and each result says which setting matched. Port of
// packages/core/src/settings-search.ts; the same on the website, iPhone and Android. No I/O.

/// A settings page's name and what's on it.
public struct SettingsSearchPage: Codable, Equatable, Sendable {
    public var label: String
    public var terms: [String]
}

/// `SETTINGS_SEARCH`'s keys (the website's /settings/<key>), in its order.
public let settingsSearchKeys: [String] = [
    "company", "team", "import", "scheduling", "phone", "price-book", "payments", "billing", "components", "tests",
    "severities", "exclusions", "skip-reasons", "reports",
]

/// `SETTINGS_SEARCH`: each settings page by its key, and what's on it.
public let settingsSearch: [String: SettingsSearchPage] = [
    "company": SettingsSearchPage(
        label: "Company and Branding",
        terms: [
            "Company name", "Legal name", "Phone", "Email", "Address", "Time zone", "Review link", "Services",
            "Quote reminders", "Invoice reminders", "Review requests", "Ask How We Did First", "Report terms",
            "Disclaimer", "Job numbers", "Logo", "Main color", "Accent color", "Branding", "Second business",
        ]),
    "team": SettingsSearchPage(
        label: "Team",
        terms: [
            "Invite", "Roles", "Owners", "Admins", "Techs", "Tech colors", "Tech photos", "Profiles",
            "Emergency contact", "Text and Call Customers", "Techs see every job", "Techs make new jobs",
            "Turn off access",
        ]),
    "import": SettingsSearchPage(
        label: "Import Customers", terms: ["Spreadsheet", "CSV", "Old software", "Customers"]),
    "scheduling": SettingsSearchPage(
        label: "Scheduling and Routes",
        terms: ["Working day", "Shop location", "Drive times", "Routes", "Start from home"]),
    "phone": SettingsSearchPage(
        label: "Phone and Texting", terms: ["Company number", "Texts", "Calls", "Voicemail", "On My Way"]),
    "price-book": SettingsSearchPage(
        label: "Price Book",
        terms: ["Prices", "Services", "Chemicals", "Repairs", "Detection fee", "Charge for Chemicals"]),
    "payments": SettingsSearchPage(
        label: "Payments and Deposits",
        terms: [
            "Deposit", "Stripe", "Card payments", "Card fee", "Autopay", "Invoice day", "Sales tax",
            "Discount limit", "Import saved cards",
        ]),
    "billing": SettingsSearchPage(label: "Sundeck Pro Billing", terms: ["Subscription", "Plan", "Receipts"]),
    "components": SettingsSearchPage(
        label: "Checklist Components", terms: ["Checklist", "Skimmer", "Main drain", "Returns", "Lights"]),
    "tests": SettingsSearchPage(
        label: "Test Types", terms: ["Pressure test", "Bucket test", "Dye test", "Thresholds"]),
    "severities": SettingsSearchPage(label: "Severities", terms: ["Findings"]),
    "exclusions": SettingsSearchPage(label: "Exclusion Reasons", terms: ["Not inspected"]),
    "skip-reasons": SettingsSearchPage(label: "Skip Reasons", terms: ["Skip Visit"]),
    "reports": SettingsSearchPage(
        label: "Report Templates",
        terms: [
            "Visit reports", "Monthly reports", "Require a Photo", "Show the Tech on Reports", "Saved reports",
        ]),
]

/// One page a search found.
public struct SettingsSearchResult: Codable, Equatable, Hashable, Sendable {
    public var key: String
    public var label: String
    /// The setting that matched, or nil when the page's own name did.
    public var match: String?
}

/// `SETTINGS_SEARCH_TEXT`.
public enum SettingsSearchText {
    public static let placeholder = "Search"
    public static let label = "Search Settings"
}

/// "No Results for “deposit”", as iOS says it.
public func settingsNoResults(_ query: String) -> String {
    "No Results for “\(ECMA.trim(query))”"
}

/// Every word of the query starts a word of the text ("dep" finds "Deposit").
private func settingsMatch(_ text: String, _ words: [String]) -> Bool {
    let have = searchWords(text)
    return words.allSatisfy { w in have.contains { $0.hasPrefix(w) } }
}

/// The pages a search finds, in Settings' order, among the pages this shop has (`keys`, in the
/// order shown). A page whose name matches comes with no setting; otherwise with the first of its
/// settings that matches. An empty query finds nothing (Settings shows its usual list).
public func searchSettings(_ query: String, _ keys: [String]) -> [SettingsSearchResult] {
    let words = searchWords(query)
    if words.isEmpty { return [] }
    var out: [SettingsSearchResult] = []
    for key in keys {
        guard let page = settingsSearch[key] else { continue }
        if settingsMatch(page.label, words) {
            out.append(SettingsSearchResult(key: key, label: page.label, match: nil))
        } else if let term = page.terms.first(where: { settingsMatch($0, words) }) {
            out.append(SettingsSearchResult(key: key, label: page.label, match: term))
        }
    }
    return out
}
