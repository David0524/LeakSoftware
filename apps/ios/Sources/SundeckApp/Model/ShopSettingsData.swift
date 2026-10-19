import Foundation
import SundeckCore
import SundeckSync

// More › Settings (spec 5.12; website app/(office)/settings and lib/settings-sections.ts). The
// index and the list pages techs' work depends on are native, read from synced rows; edits go
// through the sync layer for managers. Pages that need the website open it.

/// A settings page.
public enum SettingsPage: String, CaseIterable, Hashable, Sendable {
    case company, team
    case importCustomers = "import"
    case scheduling, phone
    case priceBook = "price-book"
    case payments, components, tests, severities, exclusions, reports

    public var title: String {
        switch self {
        case .company: "Company and Branding"
        case .team: "Team"
        case .importCustomers: "Import Customers"
        case .scheduling: "Scheduling and Routes"
        case .phone: "Phone and Texting"
        case .priceBook: "Price Book"
        case .payments: "Payments and Deposits"
        case .components: "Checklist Components"
        case .tests: "Test Types"
        case .severities: "Severities"
        case .exclusions: "Exclusion Reasons"
        case .reports: "Report Templates"
        }
    }

    /// The line under the title in the index.
    public func detail(_ services: Services) -> String {
        switch self {
        case .company: "Shown on reports, quotes, and invoices"
        case .team: "Techs, owners, and invites"
        case .importCustomers: "From a spreadsheet or your old software"
        case .scheduling: "Working day, shop location, and drive times"
        case .phone: "The company number for texts and calls"
        case .priceBook:
            services == .pool ? "Services, chemicals, and repairs for quotes" : "Detection fees and repairs for quotes"
        case .payments: "How customers pay, and deposits"
        case .components: services == .pool ? "What every visit checks" : "What every inspection checks"
        case .tests: "Tests techs record on the phone"
        case .severities: "How serious a finding is"
        case .exclusions: "Why a component wasn’t inspected"
        case .reports: "Which reports techs can send"
        }
    }

    /// The website's address for the page.
    public var webPath: String { "settings/\(rawValue)" }

    /// Built in the app; the rest open the website (spec 10.4).
    public var isNative: Bool {
        switch self {
        case .team, .priceBook, .components, .tests, .severities, .exclusions: true
        default: false
        }
    }
}

/// The settings groups, as the website's `settingsGroups()`; leak-only pages hidden for pool
/// shops. Sundeck Pro Billing is left out of the apps (decision 12).
public func settingsGroups(_ services: Services) -> [(title: String, pages: [SettingsPage])] {
    let leakOnly: Set<SettingsPage> = [.tests, .severities, .exclusions, .reports]
    let keep = { (pages: [SettingsPage]) in pages.filter { services != .pool || !leakOnly.contains($0) } }
    return [
        ("Your shop", keep([.company, .team, .importCustomers, .scheduling, .phone])),
        ("Money", keep([.priceBook, .payments])),
        (
            services == .pool ? "Checklists" : "Checklists and reports",
            keep([.components, .tests, .severities, .exclusions, .reports])
        ),
    ]
}

/// The tech's notice on Settings.
public func settingsTechNotice(_ companyName: String) -> String {
    "Settings are for owners and admins. Ask one at \(companyName) if something needs to change."
}

// MARK: - Rows

/// One row of a settings list: a config row's name, its detail and value.
public struct ConfigItem: Identifiable, Equatable, Sendable {
    public var id: String
    public var row: Row
    public var name: String
    public var detail: String?
    public var value: String?
    public var active: Bool
    public var sortOrder: Int
    /// A severity's pin color ("#C62F2B").
    public var color: String?
}

private func configRows(_ store: LocalStore, _ table: String, _ companyId: String) -> [Row] {
    ((try? store.list(table, companyId: companyId)) ?? [])
        .sorted {
            let a = Int($0["sort_order"]?.number ?? 0)
            let b = Int($1["sort_order"]?.number ?? 0)
            return a != b
                ? a < b
                : ($0["name"]?.string ?? $0["label"]?.string ?? "") < ($1["name"]?.string ?? $1["label"]?.string ?? "")
        }
}

private func item(_ r: Row, name: String, detail: String? = nil, value: String? = nil, color: String? = nil)
    -> ConfigItem
{
    let active = r["active"]?.bool ?? true
    return ConfigItem(
        id: r.id, row: r, name: name, detail: detail, value: value ?? (active ? nil : "Off"), active: active,
        sortOrder: Int(r["sort_order"]?.number ?? 0), color: color)
}

/// The price book, grouped by category in the order categories first appear, uncategorized last
/// ("Other items" when there are categories).
public func priceBookGroups(_ store: LocalStore, companyId: String) -> [(title: String?, items: [ConfigItem])] {
    var order: [String] = []
    var groups: [String: [ConfigItem]] = [:]
    for r in configRows(store, "price_book_item", companyId) {
        let key = r["category"]?.string?.trimmingCharacters(in: .whitespaces) ?? ""
        if groups[key] == nil { order.append(key) }
        let unit = r["unit"]?.string ?? "each"
        let price = formatCents(Int(r["price_cents"]?.number ?? 0))
        groups[key, default: []].append(
            item(
                r, name: r["name"]?.string ?? "Item", detail: (r["active"]?.bool ?? true) ? nil : "Hidden",
                value: "\(price) / \(unit)"))
    }
    order.sort { a, b in a.isEmpty == b.isEmpty ? false : b.isEmpty }
    let titled = order.count > 1 || (order.first.map { !$0.isEmpty } ?? false)
    return order.map { key in (titled ? (key.isEmpty ? "Other items" : key) : nil, groups[key] ?? []) }
}

/// Checklist components for one checklist (pool visits or leak inspections), with what they
/// apply to and their methods.
public func componentItems(_ store: LocalStore, companyId: String, pool: Bool) -> [ConfigItem] {
    let applies = ["pool": "Pool", "spa": "Spa", "both": "Pool and spa"]
    return configRows(store, "component_type", companyId)
        .filter { ($0["job_type"]?.string == "maintenance") == pool }
        .map { r in
            let a = r["applies_to"]?.string.flatMap { applies[$0] }
            let methods = (r["methods"]?.array ?? []).compactMap(\.string).joined(separator: ", ")
            let detail = pool ? a : [a, methods.isEmpty ? nil : methods].compactMap { $0 }.joined(separator: " · ")
            return item(r, name: r["name"]?.string ?? "Component", detail: detail?.isEmpty == true ? nil : detail)
        }
}

public func testTypeItems(_ store: LocalStore, companyId: String) -> [ConfigItem] {
    configRows(store, "test_type", companyId).map { r in
        let calc = r["calculator"].map { $0 != .null } ?? false
        return item(r, name: r["name"]?.string ?? "Test", detail: calc ? "Calculates the result" : nil)
    }
}

public func severityItems(_ store: LocalStore, companyId: String) -> [ConfigItem] {
    configRows(store, "severity_level", companyId).map { r in
        item(
            r, name: r["name"]?.string ?? "Severity",
            detail: r["must_mention"]?.bool == true ? "Always in the report summary" : nil,
            color: r["color"]?.string)
    }
}

public func exclusionItems(_ store: LocalStore, companyId: String) -> [ConfigItem] {
    configRows(store, "exclusion_reason", companyId).map { r in item(r, name: r["label"]?.string ?? "Reason") }
}

/// A person on the team: name (or email), email, role, and whether they're turned off.
public struct SettingsTeamMember: Identifiable, Equatable, Sendable {
    public var id: String
    public var userId: String
    public var name: String
    public var email: String?
    public var value: String
    public var isMe: Bool
}

public func teamMembers(_ store: LocalStore, kv: KeyValue, companyId: String, me: String?) -> [SettingsTeamMember] {
    let profiles = Dictionary(kv.team.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    return ((try? store.list("membership", companyId: companyId)) ?? [])
        .filter { $0["status"]?.string != "removed" }
        .map { m in
            let user = m["user_id"]?.string ?? ""
            let profile = profiles[user]
            return SettingsTeamMember(
                id: m.id, userId: user, name: profile?.displayName ?? "Teammate", email: profile?.email,
                value: roleLabel(m["role"]?.string) + (m["status"]?.string == "disabled" ? " · Turned off" : ""),
                isMe: user == me)
        }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
}

/// The list pages' subtitles, as the website's.
public func settingsSubtitle(_ page: SettingsPage, services: Services, poolChecklist: Bool = false) -> String? {
    switch page {
    case .priceBook:
        let what =
            switch services {
            case .pool: "Cleanings, chemicals, and repairs techs pick from when quoting extra work."
            case .leak: "Detection fees and repairs techs pick from when building a quote."
            case .both:
                "Detection fees, cleanings, chemicals, and repairs techs pick from when building a quote."
            }
        return "\(what) Prices are suggestions; a tech can adjust within the discount limit."
    case .components:
        return poolChecklist
            ? "What techs do on every pool visit. Changes apply to new visits; visits already started keep their checklist."
            : "What every leak inspection checks. Changes apply to new jobs; jobs already started keep their checklist."
    case .tests:
        return
            "Tests techs record on the phone. Pressure and bucket tests do the math; set the pass and fail lines your shop uses."
    case .severities: return "How serious a finding is. The color is the pin on the pool diagram."
    case .exclusions:
        return "Why a component wasn’t inspected. Techs must pick one, and it appears on the report."
    case .team:
        return
            "Techs run jobs on the phone. Admins run the office. Owners also handle billing, payments setup, and roles."
    default: return nil
    }
}

// MARK: - Writes (managers; through the sync layer)

/// A price book item's form.
public struct PriceItemForm: Equatable, Sendable {
    public var name = ""
    public var price = ""
    public var unit = "each"
    public var category = ""
    public var description = ""
    public var order = "0"
    public var taxable = true
    public var active = true

    public init() {}

    public init(_ row: Row) {
        name = row["name"]?.string ?? ""
        price = String(format: "%.2f", (row["price_cents"]?.number ?? 0) / 100)
        unit = row["unit"]?.string ?? "each"
        category = row["category"]?.string ?? ""
        description = row["description"]?.string ?? ""
        order = String(Int(row["sort_order"]?.number ?? 0))
        taxable = row["taxable"]?.bool ?? true
        active = row["active"]?.bool ?? true
    }

    /// Why it can't be saved, or nil.
    public var error: String? {
        if name.trimmingCharacters(in: .whitespaces).isEmpty { return "Enter a name." }
        if parseDollars(price) == nil { return "Enter a price." }
        return nil
    }

    public var values: Row {
        let opt = { (s: String) -> JSONValue in
            let t = s.trimmingCharacters(in: .whitespaces)
            return t.isEmpty ? .null : .string(t)
        }
        return [
            "name": .string(name.trimmingCharacters(in: .whitespaces)),
            "price_cents": .number(Double(parseDollars(price) ?? 0)),
            "unit": .string(unit.trimmingCharacters(in: .whitespaces).isEmpty ? "each" : unit),
            "category": opt(category), "description": opt(description),
            "sort_order": .number(Double(Int(order) ?? 0)), "taxable": .bool(taxable), "active": .bool(active),
        ]
    }
}

/// The simple form shared by components, test types, severities and exclusion reasons: the
/// name, the order, whether it's offered, and (severities) the summary rule.
public struct ConfigItemForm: Equatable, Sendable {
    public var name = ""
    public var order = "0"
    public var active = true
    public var mustMention = false

    public init() {}

    public init(_ item: ConfigItem) {
        name = item.name
        order = String(item.sortOrder)
        active = item.active
        mustMention = item.row["must_mention"]?.bool ?? false
    }

    public var error: String? { name.trimmingCharacters(in: .whitespaces).isEmpty ? "Enter a name." : nil }
}

@MainActor
public enum ConfigWrites {
    public static func savePriceItem(_ sync: SyncService, companyId: String, id: String?, _ form: PriceItemForm)
        throws
    {
        if let id {
            try sync.write("price_book_item", id: id, companyId: companyId, form.values)
        } else {
            _ = try sync.insert("price_book_item", companyId: companyId, form.values)
        }
    }

    /// Saves a component, test type, severity or exclusion reason (only the columns the phone may
    /// write); new rows only for exclusion reasons, which need nothing else.
    public static func saveItem(
        _ sync: SyncService, companyId: String, page: SettingsPage, id: String?, _ form: ConfigItemForm
    ) throws {
        let name = JSONValue.string(form.name.trimmingCharacters(in: .whitespaces))
        var values: Row = ["sort_order": .number(Double(Int(form.order) ?? 0)), "active": .bool(form.active)]
        let table: String
        switch page {
        case .components: table = "component_type"
        case .tests: table = "test_type"
        case .severities:
            table = "severity_level"
            values["must_mention"] = .bool(form.mustMention)
        case .exclusions: table = "exclusion_reason"
        default: return
        }
        values[page == .exclusions ? "label" : "name"] = name
        if let id {
            try sync.write(table, id: id, companyId: companyId, values)
        } else if page == .exclusions {
            _ = try sync.insert(table, companyId: companyId, values)
        }
    }

    /// Removes a row (kept on file, as the website's Remove).
    public static func remove(_ sync: SyncService, page: SettingsPage, id: String) throws {
        let table =
            switch page {
            case .priceBook: "price_book_item"
            case .components: "component_type"
            case .tests: "test_type"
            case .severities: "severity_level"
            case .exclusions: "exclusion_reason"
            default: ""
            }
        if !table.isEmpty { try sync.softDelete(table, id) }
    }
}
