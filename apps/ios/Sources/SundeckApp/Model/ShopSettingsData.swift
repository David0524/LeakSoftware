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
        case .team, .priceBook, .components, .tests, .severities, .exclusions, .company, .scheduling, .phone, .reports:
            true
        default: false
        }
    }
}

/// The settings groups, as the website's `settingsGroups()`; leak-only pages hidden for pool
/// shops, which keep Report Templates for their visit reports (owner, 2026-10-20). Sundeck Pro
/// Billing is left out of the apps (decision 12).
public func settingsGroups(_ services: Services) -> [(title: String, pages: [SettingsPage])] {
    let leakOnly: Set<SettingsPage> = [.tests, .severities, .exclusions]
    let keep = { (pages: [SettingsPage]) in pages.filter { services != .pool || !leakOnly.contains($0) } }
    return [
        ("Your shop", keep([.company, .team, .importCustomers, .scheduling, .phone])),
        ("Money", keep([.priceBook, .payments])),
        ("Checklists and reports", keep([.components, .tests, .severities, .exclusions, .reports])),
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
    // Chemicals first, items without a category last (owner, 2026-10-25; core price-book.ts).
    let rank = { (key: String) in key == PriceBookText.chemicals ? 0 : key.isEmpty ? 2 : 1 }
    order = order.enumerated()
        .sorted { a, b in (rank(a.element), a.offset) < (rank(b.element), b.offset) }
        .map(\.element)
    let titled = order.count > 1 || (order.first.map { !$0.isEmpty } ?? false)
    return order.map { key in
        (titled ? (key.isEmpty ? PriceBookText.uncategorized : key) : nil, groups[key] ?? [])
    }
}

/// The price book's categories and the item form's category picker (owner, 2026-10-25; website
/// and Android: packages/core/src/price-book.ts).
public enum PriceBookText {
    /// The category whose items techs add on visits as chemicals.
    public static let chemicals = "Chemicals"
    /// The picker's write-in choice, and the category saved when its field is left blank.
    public static let other = "Other"
    public static let category = "Category"
    public static let newCategory = "New category"
    public static let newCategoryPlaceholder = "Other"
    /// The heading of items saved without a category.
    public static let uncategorized = "Other items"
}

/// The category picker's choices: the shop's categories in price book order (and Chemicals for
/// pool shops), then Other, which opens a field to write one in.
public func priceBookCategoryChoices(_ groups: [(title: String?, items: [ConfigItem])], pool: Bool) -> [String] {
    var names = groups.compactMap { group in
        group.items.first.map { ($0.row["category"]?.string ?? "").trimmingCharacters(in: .whitespaces) }
    }
    .filter { !$0.isEmpty && $0 != PriceBookText.other }
    if pool && !names.contains(PriceBookText.chemicals) { names.insert(PriceBookText.chemicals, at: 0) }
    return names + [PriceBookText.other]
}

/// What the picker starts on: the item's own category when it's a choice, otherwise Other with
/// its category written in ("" for a new item, so it saves as Other).
public func priceBookCategoryStart(_ category: String?, choices: [String]) -> (choice: String, custom: String) {
    let current = (category ?? "").trimmingCharacters(in: .whitespaces)
    if !current.isEmpty && current != PriceBookText.other && choices.contains(current) { return (current, "") }
    return (PriceBookText.other, current == PriceBookText.other ? "" : current)
}

/// The category saved: the chosen one, what was written under Other, or "Other" when blank.
public func priceBookCategory(_ choice: String, custom: String) -> String {
    if !choice.isEmpty && choice != PriceBookText.other { return choice.trimmingCharacters(in: .whitespaces) }
    let written = custom.trimmingCharacters(in: .whitespaces)
    return written.isEmpty ? PriceBookText.other : written
}

/// The checklists Settings › Checklist Components lists: pool visits, leak inspections, and pool
/// inspections (2026-10-20).
public enum ChecklistList: String, CaseIterable, Hashable, Sendable {
    case pool, leak, inspection

    public var label: String {
        switch self {
        case .pool: "Pool Visits"
        case .leak: "Leak Inspections"
        case .inspection: "Pool Inspections"
        }
    }

    /// The job type whose checklist it is.
    var jobType: String {
        switch self {
        case .pool: "maintenance"
        case .leak: "detection"
        case .inspection: "inspection"
        }
    }

    /// The lists a shop sees, for what it does.
    public static func lists(_ services: Services) -> [ChecklistList] {
        switch services {
        case .both: [.pool, .leak, .inspection]
        case .leak: [.leak, .inspection]
        case .pool: [.pool]
        }
    }
}

/// A pool inspection question's answer kinds, as Settings names them.
public let inspectionAnswerLabels: [(ComponentAnswer, String)] = [
    (.choice, "One choice"), (.multi, "Several choices"), (.text, "Text"),
]

/// Checklist components for one checklist, in groups: a pool inspection's by section (with each
/// question's group and answer kind), the others in one list with what they apply to and their
/// methods.
public func componentGroups(_ store: LocalStore, companyId: String, list: ChecklistList) -> [(
    title: String?, items: [ConfigItem]
)] {
    let rows = configRows(store, "component_type", companyId)
        .filter { ($0["job_type"]?.string ?? "detection") == list.jobType }
    guard list == .inspection else { return [(nil, componentItems(rows, pool: list == .pool))] }
    return inspectionSections.compactMap { section in
        let here = rows.filter { $0["section"]?.string == section.rawValue }
        guard !here.isEmpty else { return nil }
        return (
            section.label,
            here.map { r in
                let answer = r["answer"]?.string.flatMap(ComponentAnswer.init(rawValue:))
                let detail = [
                    r["group_label"]?.string.flatMap { $0.isEmpty ? nil : $0 },
                    inspectionAnswerLabels.first { $0.0 == answer }?.1,
                ].compactMap { $0 }.joined(separator: " · ")
                return item(r, name: r["name"]?.string ?? "Question", detail: detail.isEmpty ? nil : detail)
            }
        )
    }
}

/// Pool visit or leak inspection components, with what they apply to and their methods.
private func componentItems(_ rows: [Row], pool: Bool) -> [ConfigItem] {
    let applies = ["pool": "Pool", "spa": "Spa", "both": "Pool and spa"]
    return
        rows
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
    /// The membership row.
    public var id: String
    public var userId: String
    public var name: String
    public var email: String?
    /// "Tech", or "Admin · Turned off".
    public var value: String
    public var isMe: Bool
    /// "owner", "admin" or "tech".
    public var role: String = "tech"
    public var active: Bool = true
    /// When they were turned off (`membership.disabled_at`).
    public var disabledAt: String?
    public var color: TechColor = .slate
}

extension SettingsTeamMember: TeamOrdered {
    public var orderName: String? { name }
    public var orderStatus: String { active ? "active" : "disabled" }
    public var orderDisabledAt: String? { disabledAt }
}

public func teamMembers(_ store: LocalStore, kv: KeyValue, companyId: String, me: String?) -> [SettingsTeamMember] {
    let profiles = Dictionary(kv.team.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    let rows = ((try? store.list("membership", companyId: companyId)) ?? []).filter {
        $0["status"]?.string != "removed"
    }
    let colors = memberColors(rows)
    return
        rows
        .map { m in
            let user = m["user_id"]?.string ?? ""
            let profile = profiles[user]
            let off = m["status"]?.string == "disabled"
            return SettingsTeamMember(
                id: m.id, userId: user, name: profile?.displayName ?? "Teammate", email: profile?.email,
                value: roleLabel(m["role"]?.string) + (off ? " · Turned off" : ""),
                isMe: user == me, role: m["role"]?.string ?? "tech", active: !off,
                disabledAt: m["disabled_at"]?.string, color: colors[user] ?? .slate)
        }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
}

/// Settings › Team as one list (owner, 2026-10-20: "Put the active techs on top - alphabetical
/// and the inactive beneath them - in order of departure"; core `teamOrder`).
public func teamSections(_ members: [SettingsTeamMember]) -> (active: [SettingsTeamMember], off: [SettingsTeamMember]) {
    teamOrder(members)
}

/// Settings › Team's words (the website's).
public enum TeamText {
    public static let active = "Active"
    public static let off = "Turned Off"
    public static let without = "Without the App"
    public static let on = "On"
    public static let role = "Role"
    public static let color = "Color"
    public static let turnOff = "Turn Off"
    public static let ownerOnly = "Only the shop owner can change roles."
    public static let yourself = "You can’t turn yourself off."
    public static let footer =
        "Turned-off people can’t sign in. Invite people from the website."

    /// "Turn off Tony Tech? They can't sign in, and their coming jobs stay as they are."
    public static func turnOffQuestion(_ name: String) -> String {
        "Turn off \(name)? They can’t sign in, and their coming jobs stay as they are."
    }
}

/// Settings › Team's writes on a membership, through the sync layer (owners and admins; only
/// owners change roles, and the database checks both again).
@MainActor
public enum TeamWrites {
    /// The On/Off switch: "active" or "disabled" (the database sets `disabled_at`).
    public static func setActive(_ sync: SyncService, companyId: String, membershipId: String, _ on: Bool) throws {
        try sync.write(
            "membership", id: membershipId, companyId: companyId, ["status": .string(on ? "active" : "disabled")])
    }

    /// Role and Color from a member's profile; nil leaves that one as it is.
    public static func save(
        _ sync: SyncService, companyId: String, membershipId: String, role: String?, color: TechColor?
    ) throws {
        var values: Row = [:]
        if let role { values["role"] = .string(role) }
        if let color { values["color"] = .string(color.rawValue) }
        guard !values.isEmpty else { return }
        try sync.write("membership", id: membershipId, companyId: companyId, values)
    }
}

/// The list pages' subtitles, as the website's.
public func settingsSubtitle(_ page: SettingsPage, services: Services, list: ChecklistList = .leak) -> String? {
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
        switch list {
        case .pool:
            return
                "What techs do on every pool visit. Changes apply to new visits; visits already started keep their checklist."
        case .inspection:
            return
                "Every question of a pool inspection. Changes apply to new jobs; jobs already started keep their checklist."
        case .leak:
            return
                "What every leak inspection checks. Changes apply to new jobs; jobs already started keep their checklist."
        }
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
    /// The picker's choice: one of the shop's categories, or Other (`customCategory` written in).
    public var category = PriceBookText.other
    public var customCategory = ""
    public var description = ""
    public var order = "0"
    public var taxable = true
    public var active = true

    public init() {}

    public init(_ row: Row, categories: [String] = []) {
        name = row["name"]?.string ?? ""
        price = String(format: "%.2f", (row["price_cents"]?.number ?? 0) / 100)
        unit = row["unit"]?.string ?? "each"
        (category, customCategory) = priceBookCategoryStart(row["category"]?.string, choices: categories)
        description = row["description"]?.string ?? ""
        order = String(Int(row["sort_order"]?.number ?? 0))
        taxable = row["taxable"]?.bool ?? true
        active = row["active"]?.bool ?? true
    }

    /// Why it can't be saved, or nil.
    public var error: String? {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return "Enter a name." }
        if trimmed.utf16.count > Limits.itemNameMax { return Limits.itemNameText }
        if parseDollars(price) == nil { return "Enter a price." }
        if unit.trimmingCharacters(in: .whitespaces).utf16.count > Limits.itemUnitMax { return Limits.itemUnitText }
        if category == PriceBookText.other && customCategory.trimmingCharacters(in: .whitespaces).utf16.count > 60 {
            return "Keep the category under 60 characters."
        }
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
            "category": .string(priceBookCategory(category, custom: customCategory)),
            "description": opt(description),
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

/// A pool inspection question's form in Settings (2026-10-20; website settings/components
/// `InspectionFields`): the question, its group, choices (`optionsToText`), banner, order, and
/// whether new checklists get it. Section and answer kind show but are set on the website.
public struct InspectionQuestionForm: Equatable, Sendable {
    public var name = ""
    public var section: ChecklistSection = .inspEquipment
    public var group = ""
    public var answer: ComponentAnswer = .choice
    public var options = ""
    public var notice = ""
    public var order = "3500"
    public var active = true

    public init() {}

    public init(_ row: Row) {
        name = row["name"]?.string ?? ""
        section = row["section"]?.string.flatMap(ChecklistSection.init(rawValue:)) ?? .inspEquipment
        group = row["group_label"]?.string ?? ""
        answer =
            row["answer"]?.string.flatMap(ComponentAnswer.init(rawValue:)).flatMap { $0.isInspection ? $0 : nil }
            ?? .choice
        options = optionsToText(row["options"])
        notice = row["notice"]?.string ?? ""
        order = String(Int(row["sort_order"]?.number ?? 0))
        active = row["active"]?.bool ?? true
    }

    /// "One choice", "Several choices", "Text".
    public var answerLabel: String { inspectionAnswerLabels.first { $0.0 == answer }?.1 ?? "One choice" }
    /// A text question has no choices.
    public var asksOptions: Bool { answer != .text }

    /// The first field to fix, in the website's words.
    public var error: String? {
        if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Enter a name." }
        if asksOptions && optionsFromText(options).count < 2 { return "Enter at least two choices." }
        return nil
    }

    /// The columns the phone may write.
    public var values: Row {
        func blank(_ s: String) -> JSONValue {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? .null : .string(t)
        }
        var row: Row = [
            "name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)), "group_label": blank(group),
            "notice": blank(notice), "sort_order": .number(Double(Int(order) ?? 0)), "active": .bool(active),
        ]
        if asksOptions {
            row["options"] = .array(
                optionsFromText(options).map { o in
                    var v: [String: JSONValue] = ["label": .string(o.label)]
                    if let flag = o.flag { v["flag"] = .string(flag.rawValue) }
                    if o.fold == true { v["fold"] = true }
                    return .object(v)
                })
        }
        return row
    }
}

@MainActor
public enum ConfigWrites {
    /// Saves a pool inspection question (an existing row; new questions are added on the website).
    public static func saveInspectionQuestion(
        _ sync: SyncService, companyId: String, id: String, _ form: InspectionQuestionForm
    ) throws {
        try sync.write("component_type", id: id, companyId: companyId, form.values)
    }

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

/// Settings › Team › Completing a job (owner, 2026-10-19: "Owners/admins can decide whether the
/// tech needs to fill out the checklist/submit picture first"): what Complete Job waits for.
/// Website components/job-visibility.tsx `CompleteJobForm`.
public enum CompleteJobSetting: String, CaseIterable, Sendable {
    case checklist = "require_checklist_to_finish"
    case photo = "require_finish_photo"

    public static let title = "Completing a job"

    public var label: String {
        switch self {
        case .checklist: "Finish the checklist first"
        case .photo: "Take a pool photo first"
        }
    }

    public var hint: String {
        switch self {
        case .checklist: "On: Complete Job waits until every checklist item is answered."
        case .photo: "On: Complete Job, and sending a report, wait until the job has a photo."
        }
    }

    public func isOn(_ settings: JSONValue?) -> Bool {
        switch self {
        case .checklist: requiresFinishedChecklist(settings)
        case .photo: requiresFinishPhoto(settings)
        }
    }

    /// The company's settings with this one changed, everything else kept.
    public func settings(_ settings: JSONValue?, on: Bool) -> JSONValue {
        var object: [String: JSONValue] = [:]
        if case .object(let current) = settings { object = current }
        object[rawValue] = .bool(on)
        return .object(object)
    }
}

@MainActor
extension ConfigWrites {
    /// Turns one of Completing a job's rules on or off: the company's settings through the
    /// sync layer (owners and admins; the server checks again).
    public static func setCompleteJob(
        _ sync: SyncService, companyId: String, settings: JSONValue?, _ setting: CompleteJobSetting, on: Bool
    ) throws {
        try sync.write("company", id: companyId, companyId: companyId, ["settings": setting.settings(settings, on: on)])
    }
}
