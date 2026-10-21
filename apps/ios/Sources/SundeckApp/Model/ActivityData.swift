import Foundation
import Observation
import SundeckCore

// Activity (owner, 2026-10-20: "Throw an activity feed in More"; docs/plans/
// search-and-activity.md, section 2): read from the server like the Dashboard, through the
// `activity_feed`, `activity_unread` and `mark_activity_seen` RPCs, as the signed-in person
// (row security decides what they see). Not synced, so it needs a connection.

/// `activity_feed`'s reply: a page of events, newest first, and whether more follow.
public struct ActivityPage: Decodable, Equatable, Sendable {
    public var events: [ActivityEvent]
    public var more: Bool

    enum CodingKeys: String, CodingKey { case events, more }

    public init(events: [ActivityEvent], more: Bool) {
        self.events = events
        self.more = more
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        events = try c.decodeIfPresent([ActivityEvent].self, forKey: .events) ?? []
        more = try c.decodeIfPresent(Bool.self, forKey: .more) ?? false
    }
}

/// `activity_feed(target_company, before_at, before_id, page_size)`: the page after the last
/// event shown (`after`), or the first.
public struct ActivityFeedParams: Encodable, Equatable, Sendable {
    public var targetCompany: String
    public var beforeAt: String?
    public var beforeId: String?
    public var pageSize: Int

    enum CodingKeys: String, CodingKey {
        case targetCompany = "target_company"
        case beforeAt = "before_at"
        case beforeId = "before_id"
        case pageSize = "page_size"
    }

    public init(company: String, after: ActivityEvent? = nil, pageSize: Int = ActivityText.pageSize) {
        targetCompany = company
        beforeAt = after?.createdAt
        beforeId = after?.id
        self.pageSize = pageSize
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(targetCompany, forKey: .targetCompany)
        try c.encode(beforeAt, forKey: .beforeAt)
        try c.encode(beforeId, forKey: .beforeId)
        try c.encode(pageSize, forKey: .pageSize)
    }
}

/// `activity_unread(target_company)`.
public struct ActivityUnreadParams: Encodable, Equatable, Sendable {
    public var targetCompany: String

    enum CodingKeys: String, CodingKey { case targetCompany = "target_company" }

    public init(company: String) { targetCompany = company }
}

/// The events loaded so far: the next page adds what isn't already there.
public struct ActivityLog: Equatable, Sendable {
    public var events: [ActivityEvent] = []
    public var more = false

    public init(events: [ActivityEvent] = [], more: Bool = false) {
        self.events = events
        self.more = more
    }

    /// The first page.
    public init(_ page: ActivityPage) {
        events = page.events
        more = page.more
    }

    /// The page after `events.last`.
    public mutating func append(_ page: ActivityPage) {
        let seen = Set(events.map(\.id))
        events += page.events.filter { !seen.contains($0.id) }
        more = page.more
    }

    /// The event to load the next page after, when there is one.
    public var next: ActivityEvent? { more ? events.last : nil }
}

/// Whether there is activity since this person last opened Activity: the dot on the More tab,
/// the Activity row under More, and the Dashboard's Activity card. Kept on the server per person;
/// this is the app's latest answer.
@MainActor @Observable
public final class ActivityBadge {
    public var unread = false

    public init(unread: Bool = false) { self.unread = unread }
}

/// What VoiceOver reads for the dot (the website's "New activity").
public let activityDotLabel = "New activity"
