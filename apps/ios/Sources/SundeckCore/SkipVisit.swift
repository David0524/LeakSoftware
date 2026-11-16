import Foundation

// Skip a Visit (owner, 2026-11-16; docs/design/2026-11-16-skip-visit.md). Port of skip-visit.ts: a
// maintenance visit that can't be done is skipped, with a reason from the shop's list and an
// optional note and photo; the office reschedules it or dismisses it. The database enforces the
// status rules; the words live here so the website and both apps say the same thing.

public let skipVisitLabel = "Skip Visit"
public let skipUndoLabel = "Undo Skip"
public let skipDismissLabel = "Dismiss"
public let skipRescheduleLabel = "Reschedule"
public let skipTextLabel = "Text the Customer"
public let skipNoteMax = 1000
/// The reason the day-end auto-skip gives (a system reason, never offered to pick).
public let notDoneReason = "Not Done"
/// The banner after a skip, with Undo for the usual five seconds.
public let skipBanner = "Visit skipped"
public let skipReasonRequired = "Pick a reason for skipping this visit."
public let skipUnfinishedLabel = "Skip Unfinished Visits at Day’s End"
public let skipUnfinishedHint =
    "At the end of each day, visits that were never started are skipped as Not Done, so you can reschedule or dismiss them."

/// One of the shop's skip reasons (`skip_reason` rows).
public struct SkipReason: Codable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var sortOrder: Int
    public var active: Bool
    public var system: Bool?
    public var deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, label, active, system
        case sortOrder = "sort_order"
        case deletedAt = "deleted_at"
    }

    public init(
        id: String, label: String, sortOrder: Int, active: Bool, system: Bool? = nil, deletedAt: String? = nil
    ) {
        self.id = id
        self.label = label
        self.sortOrder = sortOrder
        self.active = active
        self.system = system
        self.deletedAt = deletedAt
    }
}

/// The job fields the skip rules read.
public struct SkipJob: Decodable, Equatable, Sendable {
    public var type: String?
    public var status: String
    public var skipReason: String?
    public var skippedAt: String?
    public var skipHandledAt: String?

    enum CodingKeys: String, CodingKey {
        case type, status
        case skipReason = "skip_reason"
        case skippedAt = "skipped_at"
        case skipHandledAt = "skip_handled_at"
    }

    public init(
        type: String? = nil, status: String, skipReason: String? = nil, skippedAt: String? = nil,
        skipHandledAt: String? = nil
    ) {
        self.type = type
        self.status = status
        self.skipReason = skipReason
        self.skippedAt = skippedAt
        self.skipHandledAt = skipHandledAt
    }
}

/// The reasons a person can pick: live, offered, and not the server's own, in the shop's order.
public func pickableSkipReasons(_ rows: [SkipReason]) -> [SkipReason] {
    rows.filter { $0.active && $0.system != true && $0.deletedAt == nil }
        .sorted {
            $0.sortOrder != $1.sortOrder
                ? $0.sortOrder < $1.sortOrder : $0.label.localizedCompare($1.label) == .orderedAscending
        }
}

/// Whether Skip Visit is offered: a maintenance visit that hasn't been done yet.
public func canSkipVisit(_ job: SkipJob) -> Bool {
    job.type == "maintenance" && ["unscheduled", "scheduled", "in_progress"].contains(job.status)
}

/// The job columns Skip writes (`at` is the phone's clock: it may be offline).
public struct SkipValues: Codable, Equatable, Sendable {
    public var status: String
    public var skipReason: String
    public var skipNote: String?
    public var skippedAt: String

    enum CodingKeys: String, CodingKey {
        case status
        case skipReason = "skip_reason"
        case skipNote = "skip_note"
        case skippedAt = "skipped_at"
    }
}

public func skipValues(reason: String, note: String?, at: String) -> SkipValues {
    var trimmed = ECMA.trim(note ?? "")
    if trimmed.utf16.count > skipNoteMax {
        trimmed = String(decoding: Array(trimmed.utf16.prefix(skipNoteMax)), as: UTF16.self)
    }
    return SkipValues(
        status: "skipped", skipReason: ECMA.trim(reason), skipNote: trimmed.isEmpty ? nil : trimmed, skippedAt: at)
}

/// Whether the skip still waits for the office (Reschedule or Dismiss).
public func skipNeedsOffice(_ job: SkipJob) -> Bool {
    job.status == "skipped" && (job.skipHandledAt ?? "").isEmpty
}

/// The badge on a stop: "Skipped" (a dismissed skip too: it's still not done).
public func skipBadge(_ job: SkipJob) -> String? { job.status == "skipped" ? "Skipped" : nil }

/// What a person can do with a skipped visit. Dismiss is the office's.
public struct SkipActions: Codable, Equatable, Sendable {
    public var reschedule: Bool
    public var dismiss: Bool
    public var undo: Bool
}

public func skipActions(_ job: SkipJob, isManager: Bool) -> SkipActions {
    let skipped = job.status == "skipped"
    return SkipActions(
        reschedule: skipped && isManager,
        dismiss: skipped && isManager && (job.skipHandledAt ?? "").isEmpty,
        undo: skipped)
}

private func skipFirstWord(_ s: String) -> String {
    String(s.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: false).first ?? "")
}

/// The text Skip offers to send the customer (the tech's own phone, as On My Way does): the reason
/// in the shop's words, lowercased into the sentence.
public func skipCustomerText(customer: String?, tech: String, shop: String, reason: String) -> String {
    let hi = customer.map { $0.isEmpty ? "Hi, " : "Hi \(skipFirstWord($0)), " } ?? "Hi, "
    let shopName = shop.hasSuffix(".") ? String(shop.dropLast()) : shop
    let why = ECMA.lowercase(ECMA.trim(reason))
    return
        "\(hi)this is \(skipFirstWord(tech)) from \(shopName). We had to skip today’s pool service (\(why)). We’ll be in touch to reschedule."
}

/// The owners' and admins' push: "Visit skipped" · "Smith: Dog in Yard".
public func skipNotification(customer: String, reason: String, by: String?) -> NotificationText {
    NotificationText(
        title: "Visit skipped",
        body: "\(customer): \(reason)\(by.map { ", skipped by \($0)" } ?? "").")
}

/// The push when the day-end run skips visits nobody did: "3 visits weren't done".
public func autoSkipNotification(_ count: Int) -> NotificationText {
    NotificationText(
        title: count == 1 ? "A visit wasn’t done" : "\(count) visits weren’t done",
        body:
            "\(count == 1 ? "It was" : "They were") skipped at the end of the day. Reschedule or dismiss \(count == 1 ? "it" : "them") in Jobs › Skipped."
    )
}

/// Skip Unfinished Visits at Day's End: off unless the shop turned it on.
public func skipsUnfinishedVisits(_ settings: JSONValue?) -> Bool {
    guard case .object(let o)? = settings else { return false }
    return o["skip_unfinished_visits"] == .bool(true)
}

/// The line under a skipped visit's name: "Dog in Yard · Alex, Nov 16, 9:05 AM".
public func skipSummary(_ job: SkipJob, by: String?, when: String?) -> String {
    let who = [by, when].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
    return [job.skipReason, who.isEmpty ? nil : who].compactMap { $0 }.filter { !$0.isEmpty }.joined(
        separator: " · ")
}
