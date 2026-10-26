import Foundation

// A repair job's repairs (owner, 2026-10-22: "On repair jobs, (in the intake and actually working
// the job) we need a button to 'add additional repair'. It's common to go out and repair multiple
// parts in one job."). Each repair is a `job_repair` row, so two techs adding repairs at once
// each add a row and neither is lost; the job's price is the sum of its live repairs. A job booked
// before repairs were rows shows its booking as its one repair, written as a row with the job's
// id on the first change. Port of packages/core/src/repairs.ts.

/// Every platform's words for repairs. Port of REPAIR_LABELS.
public enum RepairLabels {
    public static let section = "Repairs"
    public static let add = "Add Additional Repair"
    public static let remove = "Remove"
    public static let total = "Total"
    public static let first = "What do they need?"
    public static let additional = "Additional repair"
    public static let item = "Repair"
    public static let pick = "Pick from the price book…"
    public static let custom = "Something else"
    public static let description = "Describe the repair"
    public static let price = "Price ($)"
    public static let fallback = "Repair"
    public static let empty = "No repairs yet."
    public static let save = "Add Repair"
    /// The note under "Repair removed" (nothing asks first since 2026-10-26: it has Undo).
    public static let removeMessage = "It comes off the job’s price. An invoice already made keeps it."
    public static let footer = "Billed on the invoice."

    /// Every label by its TypeScript key (the fixtures check them).
    public static let all: [String: String] = [
        "section": section, "add": add, "remove": remove, "total": total, "first": first,
        "additional": additional, "item": item, "pick": pick, "custom": custom, "description": description,
        "price": price, "fallback": fallback, "empty": empty, "save": save, "removeMessage": removeMessage,
        "footer": footer,
    ]
}

/// The picker's value for "Something else" (a typed description). Port of REPAIR_CUSTOM.
public let repairCustom = "custom"

/// A `job_repair` row. Port of JobRepair.
public struct JobRepair: Codable, Equatable, Sendable {
    public var id: String
    public var jobId: String
    public var priceBookItemId: String?
    public var description: String
    public var priceCents: Cents
    public var sortOrder: Int
    public var createdAt: String?
    public var deletedAt: String?

    public init(
        id: String, jobId: String, priceBookItemId: String? = nil, description: String, priceCents: Cents,
        sortOrder: Int, createdAt: String? = nil, deletedAt: String? = nil
    ) {
        self.id = id
        self.jobId = jobId
        self.priceBookItemId = priceBookItemId
        self.description = description
        self.priceCents = priceCents
        self.sortOrder = sortOrder
        self.createdAt = createdAt
        self.deletedAt = deletedAt
    }

    enum CodingKeys: String, CodingKey {
        case id, description
        case jobId = "job_id"
        case priceBookItemId = "price_book_item_id"
        case priceCents = "price_cents"
        case sortOrder = "sort_order"
        case createdAt = "created_at"
        case deletedAt = "deleted_at"
    }

    /// A row from the phone's database (nil when it isn't one).
    public init?(row: [String: JSONValue]) {
        guard let id = row["id"]?.string, let jobId = row["job_id"]?.string else { return nil }
        self.init(
            id: id, jobId: jobId, priceBookItemId: row["price_book_item_id"]?.string,
            description: row["description"]?.string ?? "", priceCents: Int(row["price_cents"]?.number ?? 0),
            sortOrder: Int(row["sort_order"]?.number ?? 0), createdAt: row["created_at"]?.string,
            deletedAt: row["deleted_at"]?.string)
    }
}

/// One repair in the job's list. Port of RepairLine.
public struct RepairLine: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var description: String
    public var priceCents: Cents
    public var priceBookItemId: String?
    /// Only the booking so far (no row yet).
    public var booked: Bool

    enum CodingKeys: String, CodingKey {
        case id, description, booked
        case priceCents = "price_cents"
        case priceBookItemId = "price_book_item_id"
    }
}

/// The fields of the job the list reads. Port of RepairJob.
public struct RepairJob: Codable, Equatable, Sendable {
    public var id: String
    public var type: String
    public var feeCents: Cents?
    public var intake: JSONValue?

    public init(id: String, type: String, feeCents: Cents?, intake: JSONValue?) {
        self.id = id
        self.type = type
        self.feeCents = feeCents
        self.intake = intake
    }

    enum CodingKeys: String, CodingKey {
        case id, type, intake
        case feeCents = "fee_cents"
    }
}

/// A price book item a repair can be picked from. Port of RepairItem.
public struct RepairItem: Codable, Equatable, Hashable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var cents: Cents

    public init(id: String, name: String, cents: Cents) {
        self.id = id
        self.name = name
        self.cents = cents
    }
}

/// A repair as typed: the picker's value ("" none, an item's id, or `repairCustom`).
public struct RepairDraft: Codable, Equatable, Sendable {
    public var pick: String
    public var description: String
    public var price: String

    public init(pick: String = "", description: String = "", price: String = "") {
        self.pick = pick
        self.description = description
        self.price = price
    }
}

/// A repair to save. Port of RepairValues.
public struct RepairValues: Codable, Equatable, Sendable {
    public var priceBookItemId: String?
    public var description: String
    public var priceCents: Cents

    public init(priceBookItemId: String?, description: String, priceCents: Cents) {
        self.priceBookItemId = priceBookItemId
        self.description = description
        self.priceCents = priceCents
    }

    enum CodingKeys: String, CodingKey {
        case description
        case priceBookItemId = "price_book_item_id"
        case priceCents = "price_cents"
    }
}

/// What to fix, by field.
public struct RepairErrors: Codable, Equatable, Sendable {
    public var description: String?
    public var price: String?

    public init(description: String? = nil, price: String? = nil) {
        self.description = description
        self.price = price
    }

    public var isEmpty: Bool { description == nil && price == nil }
}

/// One repair checked. Port of RepairCheck.
public struct RepairCheck: Codable, Equatable, Sendable {
    /// Nil: nothing entered, or something to fix.
    public var repair: RepairValues?
    public var errors: RepairErrors
}

private func trimmed(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }

/// The job's repairs in order: its live rows, or (no rows yet) the repair it was booked for.
/// Port of jobRepairLines.
public func jobRepairLines(_ job: RepairJob, _ rows: [JobRepair]) -> [RepairLine] {
    guard job.type == "repair" else { return [] }
    let own = rows.filter { $0.jobId == job.id }
    if own.isEmpty {
        let name = trimmed(job.intake?["repair_item"]?.string ?? "")
        let fee = job.feeCents ?? 0
        if name.isEmpty && fee <= 0 { return [] }
        return [
            RepairLine(
                id: job.id, description: name.isEmpty ? RepairLabels.fallback : name, priceCents: max(fee, 0),
                priceBookItemId: nil, booked: true)
        ]
    }
    return
        own
        .filter { ($0.deletedAt ?? "").isEmpty }
        .sorted { a, b in
            if a.sortOrder != b.sortOrder { return a.sortOrder < b.sortOrder }
            let (x, y) = (a.createdAt ?? "", b.createdAt ?? "")
            if x != y { return x < y }
            return a.id < b.id
        }
        .map {
            RepairLine(
                id: $0.id, description: $0.description, priceCents: $0.priceCents,
                priceBookItemId: $0.priceBookItemId, booked: false)
        }
}

/// The repairs' total: the job's price. Port of repairsTotal.
public func repairsTotal(_ cents: [Cents]) -> Cents { cents.reduce(0, +) }

/// The price a picked item fills in: "450.00". Port of repairPriceText.
public func repairPriceText(_ cents: Cents) -> String {
    let fraction = cents.magnitude % 100
    return "\(cents < 0 ? "-" : "")\(cents.magnitude / 100).\(fraction < 10 ? "0" : "")\(fraction)"
}

/// Picking from the menu: an item fills in its price. Port of pickRepair.
public func pickRepair(_ draft: RepairDraft, _ pick: String, _ items: [RepairItem]) -> RepairDraft {
    var next = draft
    next.pick = pick
    if let item = items.first(where: { $0.id == pick }) { next.price = repairPriceText(item.cents) }
    return next
}

/// One repair as typed. Port of checkRepairDraft.
public func checkRepairDraft(_ draft: RepairDraft, _ items: [RepairItem], required: Bool = false) -> RepairCheck {
    let item = !draft.pick.isEmpty && draft.pick != repairCustom ? items.first { $0.id == draft.pick } : nil
    let typed = draft.pick == repairCustom || items.isEmpty ? trimmed(draft.description) : ""
    let itemName = trimmed(item?.name ?? "")
    let name = itemName.isEmpty ? typed : itemName
    let priceText = trimmed(draft.price)
    if name.isEmpty && priceText.isEmpty {
        return RepairCheck(
            repair: nil,
            errors: RepairErrors(description: required ? "Pick a repair or describe it." : nil, price: nil))
    }
    var errors = RepairErrors()
    if draft.pick == repairCustom && typed.isEmpty {
        errors.description = "Describe the repair."
    } else if name.utf16.count > 200 {
        errors.description = "Keep it under 200 characters."
    }
    let cents = priceText.isEmpty ? nil : parseDollars(priceText)
    if priceText.isEmpty || cents == nil || (cents ?? 0) < 0 { errors.price = "Enter a price like 185." }
    guard errors.isEmpty, let cents else { return RepairCheck(repair: nil, errors: errors) }
    return RepairCheck(
        repair: RepairValues(
            priceBookItemId: item?.id, description: name.isEmpty ? RepairLabels.fallback : name, priceCents: cents),
        errors: errors)
}

/// New Job › Repair: every row checked. Port of checkRepairDrafts.
public struct RepairDraftsCheck: Codable, Equatable, Sendable {
    public var repairs: [RepairValues]
    public var errors: [RepairErrors]
    public var ok: Bool
}

public func checkRepairDrafts(_ drafts: [RepairDraft], _ items: [RepairItem]) -> RepairDraftsCheck {
    let checks = drafts.map { checkRepairDraft($0, items) }
    return RepairDraftsCheck(
        repairs: checks.compactMap(\.repair), errors: checks.map(\.errors), ok: checks.allSatisfy { $0.errors.isEmpty })
}

/// What New Job keeps in job.intake.repair_item. Port of repairBookingName.
public func repairBookingName(_ repairs: [RepairValues]) -> String? {
    let names = repairs.map { trimmed($0.description) }.filter { !$0.isEmpty }
    return names.isEmpty ? nil : names.joined(separator: ", ")
}

/// New Job: the job's price from its repairs (nil when none). Port of repairsFee.
public func repairsFee(_ repairs: [RepairValues]) -> Cents? {
    repairs.isEmpty ? nil : repairsTotal(repairs.map(\.priceCents))
}

/// A row to write through the sync layer. Port of RepairWrite.
public struct RepairWrite: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case insert, update }
    public var kind: Kind
    /// An update's row, or the booked repair's (the job's id); nil: a new id.
    public var id: String?
    public var values: [String: JSONValue]
}

/// The writes and the job's new price.
public struct RepairChange: Codable, Equatable, Sendable {
    public var writes: [RepairWrite]
    public var feeCents: Cents

    enum CodingKeys: String, CodingKey {
        case writes
        case feeCents = "fee_cents"
    }
}

private func bookedRow(_ job: RepairJob, _ line: RepairLine) -> RepairWrite {
    RepairWrite(
        kind: .insert, id: job.id,
        values: [
            "job_id": .string(job.id), "price_book_item_id": .null, "description": .string(line.description),
            "price_cents": .number(Double(line.priceCents)), "sort_order": .number(0),
        ])
}

/// Adding a repair on the job. Port of addRepairWrites.
public func addRepairWrites(_ job: RepairJob, _ rows: [JobRepair], _ repair: RepairValues) -> RepairChange {
    let lines = jobRepairLines(job, rows)
    var writes = lines.filter(\.booked).map { bookedRow(job, $0) }
    let own = rows.filter { $0.jobId == job.id }
    let next = max(0, own.map { $0.sortOrder + 1 }.max() ?? 0, lines.count)
    writes.append(
        RepairWrite(
            kind: .insert, id: nil,
            values: [
                "job_id": .string(job.id), "price_book_item_id": repair.priceBookItemId.map { .string($0) } ?? .null,
                "description": .string(repair.description), "price_cents": .number(Double(repair.priceCents)),
                "sort_order": .number(Double(next)),
            ]))
    return RepairChange(writes: writes, feeCents: repairsTotal(lines.map(\.priceCents)) + repair.priceCents)
}

/// Removing a repair (soft delete). `now` is the removal time (ISO). Port of removeRepairWrites.
public func removeRepairWrites(_ job: RepairJob, _ rows: [JobRepair], id: String, now: String) -> RepairChange {
    let lines = jobRepairLines(job, rows)
    guard let line = lines.first(where: { $0.id == id }) else {
        return RepairChange(writes: [], feeCents: repairsTotal(lines.map(\.priceCents)))
    }
    let fee = repairsTotal(lines.filter { $0.id != id }.map(\.priceCents))
    if line.booked {
        var row = bookedRow(job, line)
        row.values["deleted_at"] = .string(now)
        return RepairChange(writes: [row], feeCents: fee)
    }
    return RepairChange(
        writes: [RepairWrite(kind: .update, id: id, values: ["deleted_at": .string(now)])], feeCents: fee)
}
