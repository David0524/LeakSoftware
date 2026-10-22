import Foundation
import Observation
import SundeckCore

/// One earlier mass email, as GET /api/mass-email lists it.
public struct MassEmailHistoryRow: Identifiable, Equatable, Sendable {
    public var id: String
    public var subject: String
    public var status: String
    public var recipients: Int
    public var sent: Int
    public var failed: Int
    public var createdAt: String

    public init(_ v: JSONValue) {
        id = v["id"]?.string ?? UUID().uuidString
        subject = v["subject"]?.string ?? ""
        status = v["status"]?.string ?? "sent"
        recipients = Int(v["recipient_count"]?.number ?? 0)
        sent = Int(v["sent_count"]?.number ?? 0)
        failed = Int(v["failed_count"]?.number ?? 0)
        createdAt = v["created_at"]?.string ?? ""
    }

    public init(
        id: String, subject: String, status: String, recipients: Int, sent: Int, failed: Int, createdAt: String
    ) {
        self.id = id
        self.subject = subject
        self.status = status
        self.recipients = recipients
        self.sent = sent
        self.failed = failed
        self.createdAt = createdAt
    }

    /// "Sent to 40 · 2 didn’t go"
    public var detail: String {
        massEmailHistoryText(status: status, sent: sent, failed: failed, recipients: recipients)
    }
}

/// What the page needs from the server (GET /api/mass-email).
public struct MassEmailSetup: Equatable, Sendable {
    public var shopName: String
    /// The shop's mailing address on one line; nil when it's missing (sending is off).
    public var address: String?
    public var shows: [CustomerShowOption]
    public var cities: [String]
    /// Emails the shop can still send today.
    public var left: Int
    /// The server can send email at all.
    public var configured: Bool
    public var history: [MassEmailHistoryRow]

    public init(_ v: JSONValue) {
        shopName = v["shop"]?["name"]?.string ?? ""
        address = v["shop"]?["address"]?.string
        shows = (v["shows"]?.array ?? []).compactMap { o in
            guard let value = o["value"]?.string, let label = o["label"]?.string else { return nil }
            return CustomerShowOption(value: value, label: label)
        }
        if shows.isEmpty { shows = customerShowOptions(offersPool: true) }
        cities = (v["cities"]?.array ?? []).compactMap(\.string)
        left = Int(v["left"]?.number ?? 0)
        configured = v["configured"]?.bool ?? true
        history = (v["history"]?.array ?? []).map(MassEmailHistoryRow.init)
    }

    public init(
        shopName: String, address: String?, shows: [CustomerShowOption], cities: [String], left: Int,
        configured: Bool = true, history: [MassEmailHistoryRow]
    ) {
        self.shopName = shopName
        self.address = address
        self.shows = shows
        self.cities = cities
        self.left = left
        self.configured = configured
        self.history = history
    }
}

/// Email Customers (owner, 2026-10-22: "send mass email (with some filtering)"), as the website's
/// page (apps/web/src/components/mass-email.tsx): To (Show, City, Last Job) with the server's
/// live count, Subject and Message, Send to N Customers after an alert, Send Test to Me, and
/// the history. Everything goes through the website's /api/mass-email; offline it says so and
/// keeps what was typed. Design: docs/design/2026-10-22-mass-email.md.
@MainActor @Observable
public final class MassEmailForm {
    public private(set) var setup: MassEmailSetup?
    public private(set) var loadError: String?
    public var show = "all" {
        didSet { if show != oldValue { countStale = true } }
    }
    /// "" for Any City.
    public var city = "" {
        didSet { if city != oldValue { countStale = true } }
    }
    public var days: Int? {
        didSet { if days != oldValue { countStale = true } }
    }
    public var subject = ""
    public var body = ""
    public private(set) var count: MassEmailCount?
    public private(set) var counting = false
    /// The filter changed since the count shown.
    public private(set) var countStale = true
    public private(set) var fieldErrors: [String: String] = [:]
    public private(set) var error: String?
    public private(set) var message: String?
    public private(set) var sending = false
    private var asked = 0

    public init(setup: MassEmailSetup? = nil, count: MassEmailCount? = nil) {
        self.setup = setup
        self.count = count
        countStale = count == nil
    }

    private var audience: JSONValue {
        [
            "show": .string(show), "city": city.isEmpty ? .null : .string(city),
            "days": days.map { .number(Double($0)) } ?? .null,
        ]
    }

    public var recipients: Int { count?.recipients ?? 0 }
    public var overLimit: Bool { recipients > (setup?.left ?? 0) }
    /// No address or no email service: both send buttons are off.
    public var blocked: Bool { setup?.address == nil || setup?.configured == false }
    public var canSend: Bool {
        !sending && !counting && !countStale && !blocked && count != nil && recipients > 0 && !overLimit
    }
    public var sendTitle: String { sending ? "Sending…" : massEmailSendLabel(recipients) }

    /// The count's words, or "Counting…".
    public var countText: MassEmailCountText? { count.map(massEmailCountText) }

    private func failureText(_ e: Error) -> String {
        if let f = e as? WebAPI.Failure, f.offline { return MassEmailText.offline }
        return String(describing: e)
    }

    public func load(_ api: WebAPI, companyId: String) async {
        loadError = nil
        do {
            setup = MassEmailSetup(try await api.get("api/mass-email", query: ["company_id": companyId]))
        } catch {
            loadError = failureText(error)
        }
    }

    /// Asks the server who the filter picks; only the newest answer shows.
    public func recount(_ api: WebAPI, companyId: String) async {
        guard countStale else { return }
        asked += 1
        let ask = asked
        counting = true
        defer { if ask == asked { counting = false } }
        do {
            let r = try await api.post(
                "api/mass-email/count", ["company_id": .string(companyId), "audience": audience])
            guard ask == asked else { return }
            count = MassEmailCount(
                recipients: Int(r["recipients"]?.number ?? 0), noEmail: Int(r["no_email"]?.number ?? 0),
                unsubscribed: Int(r["unsubscribed"]?.number ?? 0))
            countStale = false
        } catch {
            guard ask == asked else { return }
            count = nil
            self.error = failureText(error)
        }
    }

    private func checkFields() -> Bool {
        fieldErrors = massEmailErrors(subject: subject, body: body)
        return fieldErrors.isEmpty
    }

    /// The alert's words before Send.
    public var confirm: MassEmailConfirm {
        massEmailConfirm(recipients, subject: subject, shop: setup?.shopName ?? "")
    }

    /// Checks the fields before the alert; false says why under them.
    public func readyToSend() -> Bool {
        error = nil
        message = nil
        return checkFields() && canSend
    }

    public func sendTest(_ api: WebAPI, companyId: String) async {
        guard !sending else { return }
        error = nil
        message = nil
        guard checkFields() else { return }
        sending = true
        defer { sending = false }
        do {
            let r = try await api.post(
                "api/mass-email/test",
                ["company_id": .string(companyId), "subject": .string(subject), "body": .string(body)])
            message = r["message"]?.string
        } catch {
            self.error = failureText(error)
        }
    }

    /// Sends to the count the alert named; a list that moved since sends nothing.
    public func send(_ api: WebAPI, companyId: String) async {
        guard !sending, checkFields() else { return }
        error = nil
        message = nil
        sending = true
        defer { sending = false }
        let expected = recipients
        do {
            let r = try await api.post(
                "api/mass-email/send",
                [
                    "company_id": .string(companyId), "subject": .string(subject), "body": .string(body),
                    "audience": audience, "expected": .number(Double(expected)),
                ])
            message = r["message"]?.string ?? massEmailSentText(sent: expected, failed: 0)
            subject = ""
            body = ""
            if var s = setup {
                s.left = max(0, s.left - expected)
                setup = s
            }
            await load(api, companyId: companyId)
        } catch {
            self.error = failureText(error)
        }
    }
}
