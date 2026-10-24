import Foundation
import Observation
import SundeckCore
import SundeckSync

// The More tab (spec 4.2, 5.8, 6.6) and the Chemical screen's form (spec 5.11): what each
// role sees and the words, kept out of SwiftUI so they test on Linux.

// MARK: - More

/// The sections under More (website `officeLinks(...).slice(4)`, minus Dashboard: decision 12).
public enum MoreLink: String, CaseIterable, Hashable, Sendable {
    case dashboard, customers, invoices, activity, chemicals, settings

    public var title: String {
        switch self {
        case .dashboard: "Dashboard"
        case .customers: "Customers"
        case .invoices: "Invoices"
        case .activity: ActivityText.title
        case .chemicals: "Chemicals"
        case .settings: "Settings"
        }
    }
}

/// Dashboard first for managers (owner, 2026-10-20: "Dashboard should be in the apps"),
/// Customers, Invoices and Activity for everyone (owner, 2026-10-20: "Throw an activity feed in
/// More"), Chemicals for pool shops, Settings for managers.
public func moreLinks(role: String?, services: Services) -> [MoreLink] {
    var links: [MoreLink] = isManagerRole(role) ? [.dashboard] : []
    links += [.customers, .invoices, .activity]
    if services != .leak { links.append(.chemicals) }
    if isManagerRole(role) { links.append(.settings) }
    return links
}

/// Where Directions open: chosen per phone (the website keeps it in a cookie).
public enum DirectionsChoice: String, CaseIterable, Hashable, Sendable {
    case automatic = "auto"
    case apple, google

    public var label: String {
        switch self {
        case .automatic: MapsLabels.automatic
        // Only here is the maps company named (owner, 2026-10-20: "Change 'Google Maps' and
        // 'Apple Maps' to just 'Maps'"): it's where someone picks one.
        case .apple: MapsLabels.apple
        case .google: MapsLabels.google
        }
    }

    public init(stored: String?) { self = stored.flatMap(DirectionsChoice.init(rawValue:)) ?? .automatic }
}

extension KVKey {
    /// More › On This Device › Directions open in. Belongs to the phone, like Appearance.
    public static let directionsChoice = "directions_open_in"
}

extension KeyValue {
    public var directionsChoice: DirectionsChoice {
        get { DirectionsChoice(stored: get(KVKey.directionsChoice)) }
        set { set(KVKey.directionsChoice, newValue.rawValue) }
    }
}

/// The Sync row's detail: the sync bar's message, or "All changes saved to the office · just now".
public func syncRowDetail(_ status: SyncStatus, now: Date = Date()) -> String {
    if let message = syncBarMessage(status, now: now) { return message.text }
    guard let last = status.lastSyncedAt else { return "Not synced yet" }
    let seconds = now.timeIntervalSince(last).rounded()
    let ago =
        seconds < 60
        ? "just now"
        : seconds < 3600 ? "\(Int((seconds / 60).rounded())) min ago" : "\(Int((seconds / 3600).rounded())) h ago"
    return "All changes saved to the office · \(ago)"
}

/// More › Help's Contact Us row (website `CONTACT_EMAIL`, apps/web/src/lib/site.ts).
public enum HelpMail {
    public static let contactEmail = "office@sundeckpro.com"
    public static let contactURL = URL(string: "mailto:\(contactEmail)")!
}

/// Request a Feature (owner, 2026-10-19: "a text box built into the platform"): one box, sent
/// to POST /api/feature-requests and saved like the website's. Port of
/// apps/web/src/components/feature-request.tsx, with the website's words.
@MainActor @Observable
public final class FeatureRequestForm {
    public static let title = "Request a Feature"
    public static let prompt = "What would make Sundeck Pro better for your shop?"
    public static let placeholder = "Describe the feature and how you’d use it."
    public static let empty = "Tell us what you’d like Sundeck Pro to do."
    public static let thanks = "Thanks! We read every request."
    /// Where it was sent from, for the office's list.
    public static let page = "iPhone app"
    public static let maxLength = 4000

    public var text = ""
    public private(set) var sending = false
    /// Under the box: nothing typed.
    public private(set) var fieldError: String?
    /// The server's or the connection's message; the text stays so it can be sent again.
    public private(set) var error: String?
    /// Sent: the thanks, then Done.
    public private(set) var sent: String?

    public init() {}

    /// "Send Request", or "Sending…" while it goes.
    public var sendTitle: String { sending ? "Sending…" : "Send Request" }

    /// What's sent: trimmed and capped like the website's `featureRequestText`, or nil.
    public static func requestText(_ text: String) -> String? {
        let trimmed = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(maxLength))
        return trimmed.isEmpty ? nil : trimmed
    }

    public func send(_ api: WebAPI, companyId: String?) async {
        guard !sending else { return }
        fieldError = nil
        error = nil
        guard let request = Self.requestText(text) else {
            fieldError = Self.empty
            return
        }
        sending = true
        defer { sending = false }
        var body: [String: JSONValue] = ["request": .string(request), "page": .string(Self.page)]
        if let companyId { body["company_id"] = .string(companyId) }
        do {
            let reply = try await api.post("api/feature-requests", .object(body))
            sent = reply["message"]?.string ?? Self.thanks
        } catch {
            self.error = String(describing: error)
        }
    }
}

/// "Version 1.2.0 (34)".
public func versionText(_ version: String?, _ build: String?) -> String {
    let v = version ?? "dev"
    guard let build, !build.isEmpty else { return "Version \(v)" }
    return "Version \(v) (\(build))"
}

/// What Sign Out asks when work hasn't reached the office (nil: nothing is waiting).
public func signOutWarning(_ status: SyncStatus) -> String? {
    status.pending + status.problems + status.uploadsWaiting > 0
        ? "Changes not yet synced stay on this phone until you sign in again." : nil
}

/// A change the server refused, in words: "Job: status, notes".
public func problemTitle(_ problem: OutboxProblem) -> String {
    let table = problem.table.replacingOccurrences(of: "_", with: " ")
    let name = table.prefix(1).uppercased() + table.dropFirst()
    return problem.fields.isEmpty ? name : "\(name): \(problem.fields.joined(separator: ", "))"
}

/// "4.2 MB".
public func byteSize(_ bytes: Int64) -> String {
    let mb = Double(bytes) / 1_048_576
    if mb >= 1 { return String(format: "%.1f MB", mb) }
    return "\(max(1, Int((Double(bytes) / 1024).rounded()))) KB"
}

// MARK: - Chemical

/// A reading's row: its name and unit as the website labels them.
public struct ChemicalReadingRow: Identifiable, Hashable, Sendable {
    public var key: ReadingKey
    public var label: String
    public var unit: String?
    public var id: ReadingKey { key }
}

public let chemicalReadingRows: [ChemicalReadingRow] = [
    .init(key: .fc, label: "Free Chlorine", unit: "ppm"),
    .init(key: .ph, label: "pH", unit: nil),
    .init(key: .ta, label: "Alkalinity", unit: "ppm"),
    .init(key: .ch, label: "Calcium", unit: "ppm"),
    .init(key: .cya, label: "Stabilizer (CYA)", unit: "ppm"),
    .init(key: .salt, label: "Salt", unit: "ppm"),
]

extension KVKey {
    /// The levels a tech aims for instead of the recommended ones (the Expo app's key, so they
    /// carry over).
    public static let chemicalGoals = "chemicals:goals"
}

/// A typed number ("20,000", "7.5"), or nil when blank or not a number.
public func chemicalNumber(_ text: String) -> Double? {
    let t = text.replacingOccurrences(of: ",", with: "").trimmingCharacters(in: .whitespaces)
    guard !t.isEmpty, let n = Double(t), n.isFinite else { return nil }
    return n
}

/// Gallons with thousands commas as they're typed: "20000" shows as "20,000" (at most 7 digits).
public func gallonsWithCommas(_ text: String) -> String {
    var digits = String(text.filter(\.isNumber).prefix(7))
    while digits.count > 1 && digits.hasPrefix("0") { digits.removeFirst() }
    guard let n = Int(digits) else { return "" }
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.locale = Locale(identifier: "en_US")
    return f.string(from: NSNumber(value: n)) ?? digits
}

/// A recommended level as the Aim For placeholder ("4", "7.5", "3200").
public func levelText(_ value: Double) -> String {
    value == value.rounded() ? String(Int(value)) : String(value)
}

/// The calculator's state: gallons, readings, chosen levels and products, and what to add.
public struct ChemicalForm: Equatable, Sendable {
    public var gallons = ""
    public var readings: [ReadingKey: String] = [:]
    public var goals: [ReadingKey: String] = [:]
    public var chlorine: ChlorineProduct = .liquid12
    public var acid: AcidProduct = .muriatic31
    /// A visit's notes on its readings (the visit's Chemicals, owner 2026-10-24).
    public var notes = ""

    public init(gallons: Double? = nil, goals: [String: String] = [:]) {
        if let gallons, gallons > 0 { self.gallons = gallonsWithCommas(String(Int(gallons.rounded()))) }
        for (k, v) in goals { if let key = ReadingKey(rawValue: k) { self.goals[key] = v } }
    }

    private func values(_ texts: [ReadingKey: String]) -> Readings {
        let n = { (key: ReadingKey) in texts[key].flatMap(chemicalNumber) }
        return Readings(fc: n(.fc), ph: n(.ph), ta: n(.ta), ch: n(.ch), cya: n(.cya), salt: n(.salt))
    }

    public var readingValues: Readings { values(readings) }
    /// Readings typed and not submitted since (`submitted`, the readings last submitted): leaving
    /// asks "Discard changes?" first (owner, 2026-10-20).
    public func hasUnsubmittedReadings(since submitted: [ReadingKey: String]) -> Bool {
        let typed = readings.filter { !$0.value.trimmingCharacters(in: .whitespaces).isEmpty }
        return !typed.isEmpty && typed != submitted.filter { !$0.value.trimmingCharacters(in: .whitespaces).isEmpty }
    }
    public var recommended: ChemistryTargets { targets(readingValues.cya) }
    public var anyGoal: Bool { goals.values.contains { chemicalNumber($0) != nil } }
    /// The chosen levels, as stored on the phone.
    public var storedGoals: [String: String] {
        Dictionary(uniqueKeysWithValues: goals.filter { !$0.value.isEmpty }.map { ($0.key.rawValue, $0.value) })
    }

    public var result: ChemistryResult {
        calculateChemistry(
            ChemistryInput(
                gallons: chemicalNumber(gallons) ?? 0, readings: readingValues, chlorine: chlorine, acid: acid,
                goals: values(goals)))
    }

    /// Gallons and at least one reading.
    public var ready: Bool { (chemicalNumber(gallons) ?? 0) > 0 && !result.statuses.isEmpty }
    public var summary: String { doseSummary(result, ready) }
}

/// A reading in the What to Add sheet: "pH 7.9 · High".
public func readingStatusText(_ s: ReadingStatus) -> String {
    let value = s.key == .ph ? String(format: "%.1f", s.value) : levelText(s.value)
    let word =
        switch s.status {
        case .ok: "OK"
        case .low: "Low"
        case .high: "High"
        }
    return "\(s.label) \(value) · \(word)"
}

/// "Saturation index +0.2 · Balanced".
public func saturationText(_ result: ChemistryResult) -> String? {
    guard let lsi = result.lsi else { return nil }
    return "Saturation index \(lsi > 0 ? "+" : "")\(String(format: "%.1f", lsi)) · \(result.lsiLabel ?? "")"
}
