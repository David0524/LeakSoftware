import Foundation
import SundeckCore
import SundeckSync

// A visit's Chemicals (owner, 2026-10-24: "the actual reading, the aim for, the suggested
// chemicals to add, and what was actually added"; docs/design/2026-10-24-chemicals-added.md;
// website components/visit-chemicals.tsx). The visit's readings are one `chemical_reading` row
// whose id is the visit's id, saved as the tech types (no Submit on visits); each chemical added
// is a `chemical_addition` row. All written on the phone through the sync layer (row + outbox),
// so it works offline. The server sets each addition's price from the price book: the phone
// never writes it, and shows the price book's price until the server's arrives.

/// A number column as JSON may hold it: a number, or text (Postgres numerics).
private func number(_ v: JSONValue?) -> Double? {
    switch v {
    case .number(let n): n
    case .string(let s): Double(s)
    default: nil
    }
}

/// The shop's chemicals as the visit and the Add Chemical sheet offer them.
public func visitChemicalItems(_ store: LocalStore, companyId: String) -> [ChemicalItem] {
    let rows = (try? store.list("price_book_item", companyId: companyId)) ?? []
    return chemicalItems(
        rows.compactMap { r in
            guard let price = number(r["price_cents"]) else { return nil }
            return ChemicalItem(
                id: r.id, name: r["name"]?.string ?? "Chemical", unit: r["unit"]?.string ?? "each",
                priceCents: Int(price), taxable: r["taxable"]?.bool, category: r["category"]?.string,
                chemical: r["chemical"]?.string, sortOrder: number(r["sort_order"]), active: r["active"]?.bool,
                deletedAt: r["deleted_at"]?.string)
        })
}

/// A synced row as an addition. Before the server's price arrives, the price book's.
func decodeChemicalAddition(_ r: Row, items: [ChemicalItem]) -> ChemicalAddition? {
    guard let job = r["job_id"]?.string, let property = r["property_id"]?.string,
        let quantity = number(r["quantity"])
    else { return nil }
    let itemId = r["price_book_item_id"]?.string
    let price =
        number(r["unit_price_cents"]).map { Int($0) } ?? items.first { $0.id == itemId }?.priceCents ?? 0
    return ChemicalAddition(
        id: r.id, jobId: job, propertyId: property, priceBookItemId: itemId, name: r["name"]?.string ?? "Chemical",
        unit: r["unit"]?.string ?? "each", readingKey: r["reading_key"]?.string.flatMap(ReadingKey.init(rawValue:)),
        suggestedQuantity: number(r["suggested_quantity"]), quantity: quantity,
        customerSupplied: r["customer_supplied"]?.bool ?? false, note: r["note"]?.string, unitPriceCents: price,
        taxable: r["taxable"]?.bool, billedInvoiceId: r["billed_invoice_id"]?.string,
        addedAt: r["added_at"]?.string ?? r["created_at"]?.string ?? "", sortOrder: number(r["sort_order"]) ?? 0,
        deletedAt: r["deleted_at"]?.string)
}

/// The visit's added chemicals (removed ones left out).
public func visitAdditions(_ store: LocalStore, jobId: String, items: [ChemicalItem]) -> [ChemicalAddition] {
    ((try? store.list("chemical_addition", jobId: jobId)) ?? [])
        .compactMap { decodeChemicalAddition($0, items: items) }
        .filter { $0.deletedAt?.isEmpty ?? true }
}

/// A pool's added chemicals, for its log's monthly use.
public func poolAdditions(_ store: LocalStore, companyId: String, propertyId: String) -> [ChemicalAddition] {
    let items = visitChemicalItems(store, companyId: companyId)
    return ((try? store.list("chemical_addition", companyId: companyId)) ?? [])
        .filter { $0["property_id"]?.string == propertyId }
        .compactMap { decodeChemicalAddition($0, items: items) }
}

/// Additions billed on a sent invoice: they can't change (sent invoices are final; the server
/// refuses it), so their sheet is read-only and their check can't be untapped. One whose invoice
/// isn't on this phone yet counts as sent. The website's `locked`.
public func lockedAdditions(_ store: LocalStore, _ additions: [ChemicalAddition]) -> Set<String> {
    Set(
        additions.compactMap { a -> String? in
            guard let invoice = a.billedInvoiceId else { return nil }
            let status = (try? store.get("invoice", invoice))?["status"]?.string
            return status == "draft" || status == "void" ? nil : a.id
        })
}

/// "Rebecca": the visit's customer's first name, for "Billed on Rebecca’s October invoice".
public func visitCustomerFirstName(_ store: LocalStore, jobId: String?, propertyId: String) -> String {
    let job = jobId.flatMap { try? store.get("job", $0) }
    let customerId =
        job?["customer_id"]?.string ?? (try? store.get("property", propertyId))?["customer_id"]?.string
    let name = customerId.flatMap { try? store.get("customer", $0) }?["name"]?.string ?? ""
    return name.split(separator: " ").first.map(String.init) ?? "the customer"
}

/// The visit's own readings: the row whose id is the visit's (or, from before, its latest).
public func visitReading(_ store: LocalStore, jobId: String) -> (reading: ChemicalReading, notes: String?)? {
    if let row = try? store.get("chemical_reading", jobId), let r = decodeChemicalReading(row) {
        return row["deleted_at"]?.string == nil ? (r, row["notes"]?.string) : nil
    }
    let rows = ((try? store.list("chemical_reading", jobId: jobId)) ?? [])
        .filter { $0["job_id"]?.string == jobId && $0["deleted_at"]?.string == nil }
        .sorted { ($0["recorded_at"]?.string ?? "") > ($1["recorded_at"]?.string ?? "") }
    guard let row = rows.first, let r = decodeChemicalReading(row) else { return nil }
    return (r, row["notes"]?.string)
}

/// The visit's Chemicals form, started from its own readings or the pool's gallons and the
/// device's remembered levels.
public func visitChemicalForm(
    _ store: LocalStore, jobId: String, poolGallons: Double?, rememberedGoals: [String: String]
) -> ChemicalForm {
    guard let visit = visitReading(store, jobId: jobId) else {
        return ChemicalForm(gallons: poolGallons, goals: rememberedGoals)
    }
    let r = visit.reading
    let notes = visit.notes
    let goals: [String: String] = Dictionary(
        uniqueKeysWithValues: ReadingKey.allCases.compactMap { k in r.goals?[k].map { (k.rawValue, levelText($0)) } })
    var form = ChemicalForm(gallons: r.gallons ?? poolGallons, goals: goals.isEmpty ? rememberedGoals : goals)
    for k in ReadingKey.allCases {
        if let v = r.readings[k] { form.readings[k] = k == .ph ? ECMAText.fixed1(v) : levelText(v) }
    }
    if let c = r.chlorineProduct { form.chlorine = c }
    if let a = r.acidProduct { form.acid = a }
    form.notes = notes ?? ""
    return form
}

/// `toFixed(1)` for pH.
enum ECMAText {
    static func fixed1(_ v: Double) -> String { String(format: "%.1f", v) }
}

/// Why the visit's readings can't be saved yet (the website's messages).
public func visitReadingProblem(_ form: ChemicalForm) -> String? {
    for key in ReadingKey.allCases {
        let raw = (form.readings[key] ?? "").replacingOccurrences(of: ",", with: "")
            .trimmingCharacters(in: .whitespaces)
        if raw.isEmpty { continue }
        let limit = key.limit
        guard let n = Double(raw), n.isFinite, n >= limit.min, n <= limit.max else {
            return
                "\(key.label) should be between \(Int(limit.min)) and \(Int(limit.max))."
        }
    }
    if (try? parsePoolGallons(form.gallons)) == nil { return "Enter the gallons as a number, like 20,000." }
    return nil
}

/// The visit's Chemicals' writes, through the sync layer.
@MainActor
public enum VisitChemicalWrites {
    /// Saves the visit's readings as typed: one row per visit (its id the visit's), updated in
    /// place; cleared of every reading, removed (and back when typed again). Fills in the pool's
    /// gallons when it has none. Returns a message when something typed isn't a reading yet.
    @discardableResult
    public static func saveReading(
        _ sync: SyncService, companyId: String, jobId: String, propertyId: String, form: ChemicalForm,
        now: Date = Date()
    ) throws -> String? {
        if let problem = visitReadingProblem(form) { return problem }
        var readings: Row = [:]
        for key in ReadingKey.allCases {
            let raw = (form.readings[key] ?? "").replacingOccurrences(of: ",", with: "")
                .trimmingCharacters(in: .whitespaces)
            readings[key.rawValue] = Double(raw).map { JSONValue.number($0) } ?? JSONValue.null
        }
        let any = readings.values.contains { $0 != .null }
        var goals: Row = [:]
        for key in ReadingKey.allCases {
            if let g = form.goals[key].flatMap(chemicalNumber), g >= key.limit.min, g <= key.limit.max {
                goals[key.rawValue] = .number(g)
            }
        }
        let gallons = (try? parsePoolGallons(form.gallons)) ?? .null
        let notes = form.notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let existing = try sync.store.get("chemical_reading", jobId)
        try sync.batch {
            if existing == nil {
                guard any else { return }
                var values = readings.filter { $0.value != .null }
                values["property_id"] = .string(propertyId)
                values["job_id"] = .string(jobId)
                values["recorded_at"] = .string(isoTimestamp(milliseconds: now.timeIntervalSince1970 * 1000))
                values["gallons"] = gallons
                values["goals"] = .object(goals)
                values["chlorine_product"] = .string(form.chlorine.rawValue)
                values["acid_product"] = .string(form.acid.rawValue)
                values["notes"] = notes.isEmpty ? .null : .string(notes)
                try sync.store.write("chemical_reading", id: jobId, companyId: companyId, values)
            } else if !any {
                if existing?["deleted_at"]?.string == nil {
                    try sync.store.write(
                        "chemical_reading", id: jobId, companyId: companyId,
                        ["deleted_at": .string(isoTimestamp(milliseconds: now.timeIntervalSince1970 * 1000))])
                }
            } else {
                var values = readings
                values["gallons"] = gallons
                values["goals"] = .object(goals)
                values["chlorine_product"] = .string(form.chlorine.rawValue)
                values["acid_product"] = .string(form.acid.rawValue)
                values["notes"] = notes.isEmpty ? .null : .string(notes)
                values["deleted_at"] = .null
                // Only what changed goes in the outbox.
                let changed = values.filter { existing?[$0.key] != $0.value }
                if !changed.isEmpty {
                    try sync.store.write("chemical_reading", id: jobId, companyId: companyId, changed)
                }
            }
            if case .number = gallons,
                (try sync.store.get("property", propertyId))?["approx_gallons"]?.number == nil
            {
                try sync.store.write("property", id: propertyId, companyId: companyId, ["approx_gallons": gallons])
            }
        }
        return nil
    }

    /// Added: one chemical, or every open suggestion at once (Mark All Added).
    public static func add(
        _ sync: SyncService, companyId: String, jobId: String, propertyId: String, _ drafts: [AdditionDraft],
        customerSupplied: Bool = false, note: String? = nil, firstSort: Int, now: Date = Date()
    ) throws {
        try sync.batch {
            for (i, d) in drafts.enumerated() {
                let trimmed = note?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                try sync.store.insert(
                    "chemical_addition", companyId: companyId,
                    [
                        "job_id": .string(jobId), "property_id": .string(propertyId),
                        "price_book_item_id": d.priceBookItemId.map { JSONValue.string($0) } ?? JSONValue.null,
                        "name": .string(d.name), "unit": .string(d.unit),
                        "reading_key": d.readingKey.map { JSONValue.string($0.rawValue) } ?? JSONValue.null,
                        "suggested_quantity": d.suggestedQuantity.map { JSONValue.number($0) } ?? JSONValue.null,
                        "quantity": .number(d.quantity), "customer_supplied": .bool(customerSupplied),
                        "note": trimmed.isEmpty ? .null : .string(trimmed),
                        "added_at": .string(isoTimestamp(milliseconds: now.timeIntervalSince1970 * 1000)),
                        "sort_order": .number(Double(firstSort + i)),
                    ])
            }
        }
    }

    /// A change to an added chemical: another chemical, the amount, Customer Supplied, the note.
    public static func update(_ sync: SyncService, companyId: String, _ a: ChemicalAddition) throws {
        let note = a.note?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        try sync.write(
            "chemical_addition", id: a.id, companyId: companyId,
            [
                "price_book_item_id": a.priceBookItemId.map { JSONValue.string($0) } ?? JSONValue.null,
                "name": .string(a.name),
                "unit": .string(a.unit), "quantity": .number(a.quantity),
                "customer_supplied": .bool(a.customerSupplied), "note": note.isEmpty ? .null : .string(note),
            ])
    }

    /// Not added after all (soft delete, so it leaves every phone).
    public static func remove(_ sync: SyncService, id: String) throws {
        try sync.softDelete("chemical_addition", id)
    }
}

/// Settings › Price Book › Charge for Chemicals, through the sync layer (owners and admins).
@MainActor
public enum ChargeChemicalsWrites {
    public static func set(_ sync: SyncService, company: CompanyContext, on: Bool, now: Date = Date()) throws {
        var o: [String: JSONValue] = [:]
        if case .object(let current) = company.settings { o = current }
        // Already on: it keeps the month it started.
        if !(on && chargesChemicals(company.settings)) {
            let today = (try? localDate(now, company.timeZone)) ?? ""
            for (k, v) in chargeChemicalsSettings(on, today: today) { o[k] = v }
        }
        try sync.write("company", id: company.id, companyId: company.id, ["settings": .object(o)])
    }
}
