import Foundation

// Customer feedback (owner's competitor notes, 2026-11-16; docs/design/
// 2026-11-16-feedback-and-text-reminders.md): the words of packages/core/src/feedback.ts and the
// reminder channel of followups.ts, the same on every platform. "How did we do?" is the customer's
// page (website only); the phone shows the office's Customer Feedback list. Checked against the
// TypeScript by Tests/SundeckCoreTests/FeedbackTests.swift (fixtures: apps/ios/fixtures/cases/feedback.ts).

/// One answer, as `public.feedback_list` returns it.
public struct FeedbackRow: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var customerId: String?
    public var customerName: String?
    public var jobId: String?
    public var jobNumber: Int?
    public var rating: String
    public var comment: String?
    public var status: String
    public var officeNote: String?
    public var closedAt: String?
    public var closedByName: String?
    public var createdAt: String

    public init(
        id: String, customerId: String? = nil, customerName: String? = nil, jobId: String? = nil,
        jobNumber: Int? = nil, rating: String, comment: String? = nil, status: String,
        officeNote: String? = nil, closedAt: String? = nil, closedByName: String? = nil, createdAt: String
    ) {
        self.id = id
        self.customerId = customerId
        self.customerName = customerName
        self.jobId = jobId
        self.jobNumber = jobNumber
        self.rating = rating
        self.comment = comment
        self.status = status
        self.officeNote = officeNote
        self.closedAt = closedAt
        self.closedByName = closedByName
        self.createdAt = createdAt
    }

    enum CodingKeys: String, CodingKey {
        case id
        case customerId = "customer_id"
        case customerName = "customer_name"
        case jobId = "job_id"
        case jobNumber = "job_number"
        case rating, comment, status
        case officeNote = "office_note"
        case closedAt = "closed_at"
        case closedByName = "closed_by_name"
        case createdAt = "created_at"
    }

    /// A thumbs down: a private complaint (a thumbs up is not a case).
    public var isComplaint: Bool { rating == "down" }
    public var isOpen: Bool { status == "open" }
}

public struct FeedbackList: Codable, Hashable, Sendable {
    public var openCount: Int
    public var rows: [FeedbackRow]

    public init(openCount: Int, rows: [FeedbackRow]) {
        self.openCount = openCount
        self.rows = rows
    }

    enum CodingKeys: String, CodingKey {
        case openCount = "open_count"
        case rows
    }
}

/// The Feedback list's segments (`FEEDBACK_FILTERS`).
public enum FeedbackFilter: String, CaseIterable, Sendable {
    case open, closed, up

    public var label: String {
        switch self {
        case .open: "Open"
        case .closed: "Closed"
        case .up: "Thumbs Up"
        }
    }
}

/// The rows a segment shows, in the order the database gave (open first, newest first).
public func feedbackFilter(_ rows: [FeedbackRow], _ filter: FeedbackFilter) -> [FeedbackRow] {
    rows.filter { r in
        switch filter {
        case .up: r.rating == "up"
        case .open: r.isComplaint && r.status == "open"
        case .closed: r.isComplaint && r.status == "closed"
        }
    }
}

public enum FeedbackText {
    public static let title = "Customer Feedback"
    public static let offline = "No connection. Connect to see customer feedback."
    public static let close = "Close"
    public static let reopen = "Reopen"
    public static let noteLabel = "Note"
    public static let notePlaceholder = "What was done about it?"
    public static let noComment = "No comment left."
    public static let thumbsUp = "Thumbs up"
    public static let customerSection = "Feedback"
    public static let seeAll = "See All Feedback"
    public static let settingTitle = "Ask How We Did First"
    public static let settingHint =
        "The review request asks “How did we do?” first. A thumbs up goes on to your Google review; a thumbs down is a private message to you. Customers with an open complaint get no review requests."
    public static let reminderChannelHint =
        "Texts go from your company number to customers with a mobile number who haven’t replied STOP. Set up texting under Phone and Texting."

    public static func empty(_ filter: FeedbackFilter) -> String {
        switch filter {
        case .open: "No open complaints."
        case .closed: "No closed complaints yet."
        case .up: "No thumbs up yet."
        }
    }
}

/// "No open complaints", "1 open complaint", "3 open complaints".
public func feedbackOpenLabel(_ open: Int) -> String {
    open <= 0 ? "No open complaints" : open == 1 ? "1 open complaint" : "\(open) open complaints"
}

/// The line under a row's name: "Job #1042 · Nov 16" (`when` is the platform's short date).
public func feedbackSubtitle(jobNumber: Int?, when: String) -> String {
    var parts: [String] = []
    if let n = jobNumber, n != 0 { parts.append("Job #\(n)") }
    if !when.isEmpty { parts.append(when) }
    return parts.joined(separator: " · ")
}

/// A thumbs down reaches the owners and admins: "Rebecca Soto: The pool is still green."
public func feedbackNotification(_ customer: String, _ comment: String?) -> NotificationText {
    let text = ECMA.trim(comment ?? "").replacing(/\s+/, with: " ")
    let units = Array(text.utf16)
    let short = units.count > 140 ? String(decoding: units.prefix(137), as: UTF16.self) + "…" : text
    return NotificationText(
        title: "Customer complaint",
        body: short.isEmpty ? "\(customer) gave a thumbs down." : "\(customer): \(short)")
}

// MARK: - Reminder channel (Settings › Company and Branding › Reminders and Reviews)

/// How reminders for unpaid invoices and unaccepted quotes go (`REMINDER_CHANNELS`).
public enum ReminderChannel: String, CaseIterable, Sendable {
    case email, text, both

    public var label: String {
        switch self {
        case .email: "Email"
        case .text: "Text"
        case .both: "Both"
        }
    }
}

/// The channel setting as stored; anything unknown is email, as before texts existed.
public func reminderChannel(_ settings: JSONValue?) -> ReminderChannel {
    switch settings?["reminders"]?["channel"]?.string {
    case "text": .text
    case "both": .both
    default: .email
    }
}

/// Whether the review request asks "How did we do?" first: on unless turned off.
public func askFeedbackFirst(_ settings: JSONValue?) -> Bool {
    settings?["ask_feedback_first"] != .bool(false)
}
