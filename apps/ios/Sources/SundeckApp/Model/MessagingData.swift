import Foundation
import SundeckCore
import SundeckSync

// Company texting and calls (owner, 2026-10-16). Conversations, texts and calls sync down like
// any other rows, so the inbox reads offline; sending and calling go through the Sundeck Pro
// server (it talks to Twilio), so they need a signal. Port of apps/mobile/src/data/texting.ts.

/// The shop's company number.
public struct PhoneLine: Decodable, Equatable, Sendable {
    public var id: String
    public var number: String
    /// pending, active or released.
    public var status: String
    public var pictures: Bool

    enum CodingKeys: String, CodingKey { case id, number, status, pictures }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        number = try c.decode(String.self, forKey: .number)
        status = try c.decode(String.self, forKey: .status)
        pictures = try c.decodeIfPresent(Bool.self, forKey: .pictures) ?? false
    }
}

public struct Conversation: Decodable, Equatable, Sendable, Identifiable {
    public var id: String
    public var phone: String
    public var customerId: String?
    public var lastAt: String
    public var lastPreview: String?
    public var unread: Bool
    public var optedOut: Bool
    /// The customer's name, else the formatted number.
    public var name = ""

    enum CodingKeys: String, CodingKey {
        case id, phone, unread
        case customerId = "customer_id"
        case lastAt = "last_at"
        case lastPreview = "last_preview"
        case optedOut = "opted_out"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        phone = try c.decode(String.self, forKey: .phone)
        customerId = try c.decodeIfPresent(String.self, forKey: .customerId)
        lastAt = try c.decodeIfPresent(String.self, forKey: .lastAt) ?? ""
        lastPreview = try c.decodeIfPresent(String.self, forKey: .lastPreview)
        unread = try c.decodeIfPresent(Bool.self, forKey: .unread) ?? false
        optedOut = try c.decodeIfPresent(Bool.self, forKey: .optedOut) ?? false
    }
}

/// A text or a call in a conversation.
public enum ThreadItem: Equatable, Sendable, Identifiable {
    case text(TextMessage)
    case call(CallLog)

    public var id: String {
        switch self {
        case .text(let t): t.id
        case .call(let c): c.id
        }
    }

    public var createdAt: String {
        switch self {
        case .text(let t): t.createdAt
        case .call(let c): c.createdAt
        }
    }
}

public struct TextMessage: Decodable, Equatable, Sendable {
    public struct Picture: Decodable, Equatable, Sendable {
        public var path: String
        public var type: String
    }

    public var id: String
    public var conversationId: String
    public var createdAt: String
    /// in or out.
    public var direction: String
    public var body: String?
    public var media: [Picture]
    public var status: String
    public var sentBy: String?
    public var error: String?

    enum CodingKeys: String, CodingKey {
        case id, direction, body, media, status, error
        case conversationId = "conversation_id"
        case createdAt = "created_at"
        case sentBy = "sent_by"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        conversationId = try c.decode(String.self, forKey: .conversationId)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        direction = try c.decode(String.self, forKey: .direction)
        body = try c.decodeIfPresent(String.self, forKey: .body)
        media = (try? c.decodeIfPresent([Picture].self, forKey: .media)) ?? []
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? ""
        sentBy = try c.decodeIfPresent(String.self, forKey: .sentBy)
        error = try c.decodeIfPresent(String.self, forKey: .error)
    }
}

public struct CallLog: Decodable, Equatable, Sendable {
    public var id: String
    public var conversationId: String?
    public var createdAt: String
    public var direction: String
    public var status: String
    public var durationSeconds: Int?
    public var userId: String?
    public var recordingSid: String?
    public var transcript: String?

    enum CodingKeys: String, CodingKey {
        case id, direction, status, transcript
        case conversationId = "conversation_id"
        case createdAt = "created_at"
        case durationSeconds = "duration_seconds"
        case userId = "user_id"
        case recordingSid = "recording_sid"
    }
}

/// The shop's working (or pending) company number.
public func companyLine(_ store: LocalStore, companyId: String) -> PhoneLine? {
    decodeRows(store, "phone_line", companyId, as: PhoneLine.self).first { $0.status != "released" }
}

/// Conversations, newest first, each named for its customer when there is one.
public func conversations(_ store: LocalStore, companyId: String) -> [Conversation] {
    struct Customer: Decodable {
        let id: String
        let name: String
    }
    let names = Dictionary(
        decodeRows(store, "customer", companyId, as: Customer.self).map { ($0.id, $0.name) },
        uniquingKeysWith: { a, _ in a })
    return decodeRows(store, "conversation", companyId, as: Conversation.self)
        .map {
            var c = $0
            c.name = c.customerId.flatMap { names[$0] } ?? formatPhone(c.phone)
            return c
        }
        .sorted { $0.lastAt > $1.lastAt }
}

/// One conversation's texts and calls, oldest first.
public func thread(_ store: LocalStore, companyId: String, conversationId: String) -> [ThreadItem] {
    let texts = decodeRows(store, "text_message", companyId, as: TextMessage.self)
        .filter { $0.conversationId == conversationId }.map(ThreadItem.text)
    let calls = decodeRows(store, "call_log", companyId, as: CallLog.self)
        .filter { $0.conversationId == conversationId }.map(ThreadItem.call)
    return (texts + calls).sorted { $0.createdAt < $1.createdAt }
}

@MainActor
public enum MessagingWrites {
    /// Opening a conversation marks it read for the whole team.
    public static func markRead(_ sync: SyncService, companyId: String, _ conversation: Conversation) throws {
        if conversation.unread { try setUnread(sync, companyId: companyId, conversation.id, false) }
    }

    /// Unread or read for the whole team (owner, 2026-10-16: unread is shared).
    public static func setUnread(_ sync: SyncService, companyId: String, _ conversationId: String, _ unread: Bool)
        throws
    {
        try sync.write("conversation", id: conversationId, companyId: companyId, ["unread": .bool(unread)])
    }
}

/// Texts and calls through the website (which talks to Twilio).
@MainActor
public struct TextingServer {
    public let sync: SyncService
    public let api: WebAPI

    public init(sync: SyncService, api: WebAPI) {
        self.sync = sync
        self.api = api
    }

    /// Texts from the company number. The text syncs back down with its delivery status.
    /// `pictures` are storage paths already uploaded.
    /// `companyId` and `phone` text a number that isn't a customer yet.
    public func send(
        conversationId: String? = nil, customerId: String? = nil, companyId: String? = nil, phone: String? = nil,
        body: String, pictures: [TextMessage.Picture] = [], jobId: String? = nil
    ) async throws -> (id: String, conversationId: String) {
        var payload: [String: JSONValue] = [
            "body": .string(body),
            "pictures": .array(pictures.map { ["path": .string($0.path), "type": .string($0.type)] }),
            "jobId": jobId.map(JSONValue.string) ?? .null,
        ]
        if let conversationId { payload["conversationId"] = .string(conversationId) }
        if let customerId { payload["customerId"] = .string(customerId) }
        if let companyId, let phone {
            payload["companyId"] = .string(companyId)
            payload["phone"] = .string(phone)
        }
        let reply = try await api.post("api/texts", .object(payload))
        await sync.syncNow()
        return (reply["id"]?.string ?? "", reply["conversationId"]?.string ?? conversationId ?? "")
    }

    /// Rings my phone, then connects me to the customer from the company number.
    public func call(conversationId: String) async throws -> (calling: String, demo: Bool) {
        let reply = try await api.post("api/calls", ["conversationId": .string(conversationId)])
        return (reply["calling"]?.string ?? "", reply["demo"]?.bool ?? false)
    }
}
