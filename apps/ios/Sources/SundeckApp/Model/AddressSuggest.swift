import Foundation
import Observation
import SundeckCore

// Address suggestions as you type (owner, 2026-10-20: "an auto complete or something for the
// mapping because it's just too big of an issue if a address doesn't register"): every street
// address field asks POST /api/address/suggest after a short pause and shows up to 5 real
// addresses under it; picking one fills the street, city, state and ZIP, so the address the map
// knows is the one saved. Typing your own still works. Website components/address-field.tsx.

/// An address the server suggests (core `AddressSuggestion`; Mapbox's temporary results).
public struct AddressSuggestion: Codable, Equatable, Hashable, Sendable {
    public var line1: String
    public var city: String
    public var state: String
    public var postalCode: String
    /// The whole address ("123 Main St, Phoenix, Arizona 85001").
    public var label: String

    public init(line1: String, city: String, state: String, postalCode: String, label: String) {
        self.line1 = line1
        self.city = city
        self.state = state
        self.postalCode = postalCode
        self.label = label
    }

    enum CodingKeys: String, CodingKey {
        case line1, city, state, label
        case postalCode = "postal_code"
    }

    /// The row's second line: "Phoenix, AZ 85001".
    public var cityLine: String {
        let stateZip = [state, postalCode].filter { !$0.isEmpty }.joined(separator: " ")
        return [city, stateZip].filter { !$0.isEmpty }.joined(separator: ", ")
    }

    /// What VoiceOver reads for the row.
    public var spoken: String {
        "Suggested address, \([line1, cityLine].filter { !$0.isEmpty }.joined(separator: ", "))"
    }
}

/// The suggestions shown under one street field.
@MainActor @Observable
public final class AddressSuggester {
    /// The pause after typing before asking, so each letter isn't a lookup (the website's 300 ms).
    public static let pause: Duration = .milliseconds(300)
    /// At most this many rows.
    public static let limit = 5
    /// Shorter text isn't looked up (the server answers nothing under 4 characters).
    public static let minLength = 4

    public private(set) var items: [AddressSuggestion] = []
    @ObservationIgnored private var picked: String?
    /// How it asks (the server's /api/address/suggest, set by the field once it knows the shop).
    @ObservationIgnored public var fetch: @Sendable (String) async -> [AddressSuggestion]

    public init(fetch: @escaping @Sendable (String) async -> [AddressSuggestion] = { _ in [] }) { self.fetch = fetch }

    /// The street field's text changed while it has the keyboard: after the pause, the
    /// suggestions for it. Cancelled (a newer change, or the field let go) leaves them as they
    /// are; `close` clears them.
    public func typed(_ text: String) async {
        let q = text.trimmingCharacters(in: .whitespacesAndNewlines)
        // A pick puts its street in the field: that isn't typing.
        if let picked, picked == text {
            items = []
            return
        }
        picked = nil
        guard q.count >= Self.minLength else {
            items = []
            return
        }
        try? await Task.sleep(for: Self.pause)
        if Task.isCancelled { return }
        let found = await fetch(q)
        if Task.isCancelled { return }
        items = Array(found.prefix(Self.limit))
    }

    /// A row picked: the list closes, and the street it fills in isn't looked up again.
    @discardableResult
    public func pick(_ s: AddressSuggestion) -> AddressSuggestion {
        picked = s.line1
        items = []
        return s
    }

    public func close() { items = [] }
}

extension WebAPI {
    /// POST /api/address/suggest: real addresses near the shop for what's typed. Empty when
    /// lookups aren't set up, under 4 characters, past the day's allowance, or offline.
    public func suggestAddresses(companyId: String, _ q: String) async -> [AddressSuggestion] {
        guard let reply = try? await post("api/address/suggest", ["company_id": .string(companyId), "q": .string(q)]),
            case .array(let rows)? = reply["suggestions"]
        else { return [] }
        return rows.compactMap { row in
            guard let line1 = row["line1"]?.string, !line1.isEmpty else { return nil }
            return AddressSuggestion(
                line1: line1, city: row["city"]?.string ?? "", state: row["state"]?.string ?? "",
                postalCode: row["postal_code"]?.string ?? "", label: row["label"]?.string ?? line1)
        }
    }
}
