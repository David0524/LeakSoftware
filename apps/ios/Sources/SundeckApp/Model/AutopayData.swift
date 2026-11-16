import Foundation
import SundeckCore
import SundeckSync

// Autopay on the phone (docs/design/2026-11-16-autopay.md; website components/autopay.tsx,
// Android features/autopay/AutopayGroup.tsx). A customer's saved card (customer_payment_method)
// and customer.autopay are server-written rows that sync down to owners' and admins' phones;
// the Autopay group's actions and Charge Card on File are the website's
// POST /api/customers/{id}/autopay and POST /api/invoices/{id}/charge, and the change syncs back.

/// The customer's saved card or bank account, or nil (none, or not a manager's phone).
public func savedMethod(_ store: LocalStore, companyId: String, customerId: String?) -> SavedMethod? {
    guard let customerId else { return nil }
    let row = ((try? store.list("customer_payment_method", companyId: companyId)) ?? [])
        .first { $0["customer_id"]?.string == customerId && $0["deleted_at"]?.string == nil }
    return row.flatMap { try? JSONValue.object($0).decode(SavedMethod.self) }
}

/// An invoice row's latest automatic charge.
public func autopayInvoice(_ row: Row) -> AutopayInvoice {
    AutopayInvoice(
        status: row["autopay_status"]?.string, method: row["autopay_method"]?.string,
        failure: row["autopay_failure"]?.string, nextTry: row["autopay_next_try"]?.string)
}

public enum AutopayServer {
    public enum Action: String, Sendable {
        case turnOff = "turn_off"
        case turnOn = "turn_on"
        case remove, request
    }

    public enum Channel: String, Sendable {
        case email, text, link
    }

    public struct Reply: Equatable, Sendable {
        public var message: String
        public var link: String?
        public var text: String?
    }

    /// One of the Autopay group's actions; Request Card on File by email, text, or a link.
    public static func run(
        _ api: WebAPI, sync: SyncService, customerId: String, action: Action, channel: Channel = .link
    ) async throws -> Reply {
        let reply = try await api.post(
            "api/customers/\(customerId)/autopay",
            ["action": .string(action.rawValue), "channel": .string(channel.rawValue)])
        Task { await sync.syncNow() }
        return Reply(
            message: reply["message"]?.string ?? "", link: reply["link"]?.string, text: reply["text"]?.string)
    }

    /// Charge Card on File. A decline comes back as outcome "failed", with the reason.
    public static func charge(_ api: WebAPI, sync: SyncService, invoiceId: String) async throws -> (
        failed: Bool, message: String
    ) {
        let reply = try await api.post("api/invoices/\(invoiceId)/charge")
        Task { await sync.syncNow() }
        return (reply["outcome"]?.string == "failed", reply["message"]?.string ?? "")
    }
}
