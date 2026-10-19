import Foundation
import SundeckCore
import SundeckSync

// The Chemical screen's Submit and the pool's chemical log (owner, 2026-10-19; website
// app/actions/chemicals.ts and app/(office)/chemicals/page.tsx). Readings are synced
// `chemical_reading` rows, written on the phone (row + outbox), so Submit works offline.

/// The pool the Chemical screen was opened for: from a visit (with its job) or a customer's pool.
public struct ChemicalTarget: Hashable, Sendable {
    public var propertyId: String
    public var jobId: String?

    public init(propertyId: String, jobId: String? = nil) {
        self.propertyId = propertyId
        self.jobId = jobId
    }
}

/// The pool as the Chemical screen shows it.
public struct ChemicalPool: Equatable, Sendable {
    public var propertyId: String
    public var jobId: String?
    /// The customer's name, else the address ("Submit saves these readings to {name}’s log").
    public var name: String
    /// "Maria Alvarez · 1423 Palm Ct, Mesa, AZ 85201", under the title.
    public var subtitle: String
    /// The pool's gallons, which the screen starts from.
    public var gallons: Double?
}

/// The pool for the Chemical screen, or nil when it's gone (the screen is then a plain calculator).
public func chemicalPool(_ store: LocalStore, _ target: ChemicalTarget) -> ChemicalPool? {
    guard let p = try? store.get("property", target.propertyId), p["deleted_at"]?.string == nil else { return nil }
    let address = decodeProperty(p).map(formatAddress) ?? ""
    let customer = p["customer_id"]?.string.flatMap { try? store.get("customer", $0) }
    let customerName = customer?["name"]?.string.flatMap { $0.isEmpty ? nil : $0 }
    let name = customerName ?? (address.isEmpty ? "this pool" : address)
    return ChemicalPool(
        propertyId: p.id, jobId: target.jobId, name: name,
        subtitle: [customerName ?? "", address].filter { !$0.isEmpty }.joined(separator: " · "),
        gallons: p["approx_gallons"]?.number.flatMap { $0 > 0 ? $0 : nil })
}

/// What the Chemical screen says under Submit, and without a pool.
public enum ChemicalLogText {
    public static func submitHint(_ pool: ChemicalPool) -> String {
        "Saves these readings to \(pool.name)’s chemical log."
    }
    public static let noPool = "To save readings to a pool’s log, open Chemical from a visit or the customer’s pool."
    public static let submitted = "Submitted."
    public static let removed = "Removed."
    public static let logTitle = "Chemical log"
    public static let logFooter = "One entry for each Submit, newest first."
    public static let logEmpty = "No readings submitted yet"
    public static let removeTitle = "Remove these readings?"
    public static let removeMessage = "They come off the pool’s chemical log."
    public static let removeButton = "Remove Readings"
    /// The customer's pool row when nothing is submitted yet.
    public static let poolRowEmpty = "Readings and the chemical log"
}

/// Why a Submit can't be saved (the website's messages).
public struct ChemicalSubmitError: Error, Equatable, Sendable {
    public var message: String
}

/// A number as JavaScript's template literal writes it ("0", "14", "20000").
private func limitText(_ x: Double) -> String {
    x == x.rounded() && abs(x) < 1e15 ? String(Int(x)) : String(x)
}

/// The fields one Submit saves, checked as the website checks them: each typed reading (commas
/// ignored) within `READING_LIMITS`, at least one reading, and gallons as Pool Details reads them.
/// Only the readings that were filled in are included.
public func chemicalSubmitValues(_ form: ChemicalForm) throws(ChemicalSubmitError) -> Row {
    var values: Row = [:]
    for key in ReadingKey.allCases {
        let raw = (form.readings[key] ?? "").replacingOccurrences(of: ",", with: "")
            .trimmingCharacters(in: .whitespaces)
        if raw.isEmpty { continue }
        let limit = key.limit
        guard let n = Double(raw), n.isFinite, n >= limit.min, n <= limit.max else {
            throw ChemicalSubmitError(
                message: "\(key.label) should be between \(limitText(limit.min)) and \(limitText(limit.max)).")
        }
        values[key.rawValue] = .number(n)
    }
    if values.isEmpty { throw ChemicalSubmitError(message: "Enter at least one reading.") }
    do {
        let gallons = try parsePoolGallons(form.gallons)
        if gallons != .null { values["gallons"] = gallons }
    } catch {
        throw ChemicalSubmitError(message: error.message)
    }
    values["chlorine_product"] = .string(form.chlorine.rawValue)
    values["acid_product"] = .string(form.acid.rawValue)
    return values
}

/// The chemical log's writes, through the sync layer.
@MainActor
public enum ChemicalLogWrites {
    /// Saves one Submit as a `chemical_reading` row (UUIDv7 id, row + outbox), and fills in the
    /// pool's gallons when it has none, in one transaction. Returns the new row's id.
    @discardableResult
    public static func submit(
        _ sync: SyncService, companyId: String, pool: ChemicalPool, form: ChemicalForm, now: Date = Date()
    ) throws -> String {
        var values = try chemicalSubmitValues(form)
        values["property_id"] = .string(pool.propertyId)
        if let jobId = pool.jobId { values["job_id"] = .string(jobId) }
        values["recorded_at"] = .string(isoTimestamp(milliseconds: now.timeIntervalSince1970 * 1000))
        return try sync.batch {
            let id = try sync.store.insert("chemical_reading", companyId: companyId, values)
            if let gallons = values["gallons"],
                (try sync.store.get("property", pool.propertyId))?["approx_gallons"]?.number == nil
            {
                try sync.store.write(
                    "property", id: pool.propertyId, companyId: companyId, ["approx_gallons": gallons])
            }
            return id
        }
    }

    /// Remove (a reading submitted by mistake): sets `deleted_at`, which syncs.
    public static func remove(_ sync: SyncService, readingId: String) throws {
        try sync.softDelete("chemical_reading", readingId)
    }
}

/// One line of a pool's chemical log.
public struct ChemicalLogEntry: Identifiable, Equatable, Sendable {
    public var id: String
    /// "FC 3 · pH 7.6 · TA 90".
    public var summary: String
    /// "Mon, Oct 19, 8:15 AM · Tony Tech · 20,000 gal".
    public var detail: String
    public var recordedAt: String
}

/// A synced row as a reading; numeric columns may arrive as numbers or as text.
func decodeChemicalReading(_ row: Row) -> ChemicalReading? {
    func n(_ key: String) -> Double? {
        switch row[key] {
        case .number(let v): v
        case .string(let s): Double(s)
        default: nil
        }
    }
    guard let property = row["property_id"]?.string else { return nil }
    return ChemicalReading(
        id: row.id, propertyId: property, jobId: row["job_id"]?.string,
        recordedAt: row["recorded_at"]?.string ?? row["created_at"]?.string ?? "",
        recordedBy: row["recorded_by"]?.string, gallons: n("gallons"), fc: n("fc"), ph: n("ph"), ta: n("ta"),
        ch: n("ch"), cya: n("cya"), salt: n("salt"),
        chlorineProduct: row["chlorine_product"]?.string.flatMap(ChlorineProduct.init(rawValue:)),
        acidProduct: row["acid_product"]?.string.flatMap(AcidProduct.init(rawValue:)), notes: row["notes"]?.string)
}

/// The pool's readings, newest first (removed ones left out).
func chemicalReadings(_ store: LocalStore, companyId: String, propertyId: String) -> [ChemicalReading] {
    ((try? store.list("chemical_reading", companyId: companyId)) ?? [])
        .filter { $0["property_id"]?.string == propertyId && $0["deleted_at"]?.string == nil }
        .compactMap(decodeChemicalReading)
        .sorted { $0.recordedAt != $1.recordedAt ? $0.recordedAt > $1.recordedAt : $0.id > $1.id }
}

/// The pool's chemical log as the Chemical screen lists it: readings, when, who, and gallons.
public func chemicalLog(
    _ store: LocalStore, companyId: String, propertyId: String, names: [String: String], now: Date = Date(),
    timeZone: String
) -> [ChemicalLogEntry] {
    chemicalReadings(store, companyId: companyId, propertyId: propertyId).map { r in
        ChemicalLogEntry(
            id: r.id, summary: readingSummary(r.readings),
            detail: [
                try? formatSchedule(r.recordedAt, now, timeZone), r.recordedBy.flatMap { names[$0] },
                r.gallons.flatMap { $0 > 0 ? "\(gallonsWithCommas(String(Int($0.rounded())))) gal" : nil },
            ]
            .compactMap { $0 }.joined(separator: " · "),
            recordedAt: r.recordedAt)
    }
}

/// The customer's pool row: "Last: FC 3 · pH 7.6 · TA 90 · Mon, Oct 19, 8:15 AM", or nil before
/// any reading is submitted.
public func latestChemicalLine(
    _ store: LocalStore, companyId: String, propertyId: String, now: Date = Date(), timeZone: String
) -> String? {
    guard let r = chemicalReadings(store, companyId: companyId, propertyId: propertyId).first else { return nil }
    let when = (try? formatSchedule(r.recordedAt, now, timeZone)) ?? ""
    return "Last: \(readingSummary(r.readings)) · \(when)"
}
