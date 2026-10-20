import Foundation

// The first download on a phone (owner, 2026-10-20: "Downloading your company takes a long
// time. Give a more interesting loading bar."): what's been downloaded against what's there
// (public.sync_pull_count), as one fraction and a few kinds of things the shop recognizes. Port
// of download.ts.

/// A kind of thing the first download lists, and the tables it counts (`DOWNLOAD_KINDS`).
public struct DownloadKindInfo: Codable, Equatable, Sendable {
    public var key: String
    public var label: String
    public var tables: [String]
}

/// The kinds, in the order they're listed (`DOWNLOAD_KINDS`).
public let downloadKinds: [DownloadKindInfo] = [
    DownloadKindInfo(key: "customers", label: "Customers", tables: ["customer"]),
    DownloadKindInfo(key: "pools", label: "Pools", tables: ["property", "service_plan", "plan_cleaning"]),
    DownloadKindInfo(
        key: "jobs", label: "Jobs",
        tables: [
            "job", "job_component", "checklist_item_result", "test_result", "finding", "chemical_reading", "signature",
        ]),
    DownloadKindInfo(key: "photos", label: "Photos and Videos", tables: ["media"]),
    DownloadKindInfo(
        key: "paperwork", label: "Reports, Quotes, and Invoices",
        tables: ["report", "quote", "quote_line_item", "invoice", "invoice_line_item", "payment", "share_link"]),
    DownloadKindInfo(
        key: "messages", label: "Messages",
        tables: ["message", "phone_line", "conversation", "text_message", "call_log"]),
]

/// One kind's row (`DownloadKind`).
public struct DownloadKind: Codable, Equatable, Sendable {
    public var key: String
    public var label: String
    /// The tables it counts (none for Settings, which is everything else).
    public var tables: [String]?
    /// Rows of this kind downloaded so far, never more than `total`.
    public var done: Int
    public var total: Int
    public var complete: Bool
}

/// The first download's progress (`DownloadProgress`).
public struct DownloadProgress: Codable, Equatable, Sendable {
    /// 0..1, or nil before the count is known (show the water moving without a number).
    public var fraction: Double?
    /// "42%", or "" before the count is known.
    public var percent: String
    /// Only kinds the shop has, in `downloadKinds` order, Settings first.
    public var kinds: [DownloadKind]
    /// The kind being downloaded now: the first not yet complete.
    public var current: DownloadKind?
    /// "Downloading your company, 42 percent."
    public var spoken: String

    enum CodingKeys: String, CodingKey { case fraction, percent, kinds, current, spoken }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(fraction, forKey: .fraction)
        try c.encode(percent, forKey: .percent)
        try c.encode(kinds, forKey: .kinds)
        try c.encode(current, forKey: .current)
        try c.encode(spoken, forKey: .spoken)
    }
}

/// Progress from rows downloaded per table and the totals per table (nil until the count comes
/// back). A table's downloaded rows count up to its total only, so a row changed during the
/// download (sent twice) never pushes past 100%; the screen finishes when the download does.
public func downloadProgress(_ pulled: [String: Int], _ totals: [String: Int]?) -> DownloadProgress {
    var kinds: [String: DownloadKind] = [:]
    if let totals {
        for (table, total) in totals where total > 0 {
            let info = downloadKinds.first { $0.tables.contains(table) }
            let key = info?.key ?? "settings"
            var row =
                kinds[key]
                ?? DownloadKind(
                    key: key, label: info?.label ?? "Settings", tables: info?.tables, done: 0, total: 0,
                    complete: false)
            row.done += min(max(pulled[table] ?? 0, 0), total)
            row.total += total
            kinds[key] = row
        }
    }
    let order = ["settings"] + downloadKinds.map(\.key)
    let list = kinds.values
        .map { k -> DownloadKind in
            var k = k
            k.complete = k.done >= k.total
            return k
        }
        .sorted { (order.firstIndex(of: $0.key) ?? 0) < (order.firstIndex(of: $1.key) ?? 0) }
    let total = list.reduce(0) { $0 + $1.total }
    let done = list.reduce(0) { $0 + $1.done }
    let fraction: Double? = totals != nil && total > 0 ? Double(done) / Double(total) : nil
    let whole = fraction.map { Int(($0 * 100).rounded(.down)) }
    return DownloadProgress(
        fraction: fraction, percent: whole.map { "\($0)%" } ?? "", kinds: list,
        current: list.first { !$0.complete },
        spoken: whole.map { "Downloading your company, \($0) percent." } ?? "Downloading your company.")
}

/// "312 of 1,240" for a kind's row (`downloadCount`).
public func downloadCount(done: Int, total: Int) -> String {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "en_US")
    f.numberStyle = .decimal
    func n(_ v: Int) -> String { f.string(from: NSNumber(value: v)) ?? String(v) }
    return "\(n(done)) of \(n(total))"
}
