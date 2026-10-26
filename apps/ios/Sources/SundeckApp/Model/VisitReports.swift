import Foundation
import SundeckCore
import SundeckSync

// Maintenance visit reports (owner, 2026-10-20: "For the maintenance plan, build a report with
// the tested chemicals, checklist, cleanings, photos, etc. Then have an option to send the report
// to customers. Include manual send and auto send. Owner/admin can turn that off in their own
// settings"). The server builds and freezes the report at a customer link
// (POST api/jobs/{id}/visit-report); sent versions are synced `report` rows with template_key
// "maintenance" and their `share_link`. Website components/visit-report-panel.tsx.

public enum VisitReportText {
    public static let title = "Visit Report"
    public static let view = "View Visit Report"
    public static let customerEmail = "Customer email"
    public static let sendEmail = "Send by Email"
    public static let sendAgain = "Send Again by Email"
    public static let sendText = "Send by Text"
    public static let getLink = "Get Link to Text"
    public static let settingsGroup = "Visit reports"
    public static let emailed = "Visit report emailed."
    public static let texted = "Visit report texted."
    public static let ready = "Visit report ready. Text the customer the link."
    public static let notSent = "The visit report wasn’t sent."
    public static let enterEmail = "Enter the customer’s email."
}

/// A sent version of a visit's report.
public struct VisitReportVersion: Identifiable, Equatable, Sendable {
    public var id: String
    public var version: Int
    /// The newest one sent (status "sent"; older ones are superseded).
    public var current: Bool
    public var sentAt: String?
    public var token: String?
}

/// The visit's sent reports, newest first, each with its customer link's token.
public func visitReportVersions(_ store: LocalStore, jobId: String) -> [VisitReportVersion] {
    var tokens: [String: String] = [:]
    for link in (try? store.list("share_link", jobId: jobId)) ?? [] where link["revoked_at"]?.string == nil {
        if let report = link["report_id"]?.string, let token = link["token"]?.string { tokens[report] = token }
    }
    return ((try? store.list("report", jobId: jobId)) ?? [])
        .filter { $0["template_key"]?.string == "maintenance" && $0["deleted_at"]?.string == nil }
        .compactMap { r -> VisitReportVersion? in
            guard let id = r["id"]?.string else { return nil }
            return VisitReportVersion(
                id: id, version: Int(r["version"]?.number ?? 1), current: r["status"]?.string == "sent",
                sentAt: r["sent_at"]?.string, token: tokens[id])
        }
        .sorted { $0.version > $1.version }
}

/// "Oct 20, 2026, 9:42 AM" in the shop's time zone (`dateStyle: medium, timeStyle: short`).
public func visitReportDate(_ iso: String?, timeZone: String) -> String {
    guard let iso, let date = parseISODate(iso) else { return "" }
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(identifier: timeZone) ?? .current
    f.dateFormat = "MMM d, yyyy, h:mm a"
    return f.string(from: date)
}

/// The line at the top of the section.
public func visitReportStatus(
    _ versions: [VisitReportVersion], mode: VisitReportMode, done: Bool, timeZone: String
) -> String {
    if let latest = versions.first(where: \.current) {
        return "Sent \(visitReportDate(latest.sentAt, timeZone: timeZone))"
            + (latest.version > 1 ? " · version \(latest.version)" : "") + "."
    }
    if mode == .auto {
        return done ? "Sending to the customer now." : "Goes to the customer by itself when this visit is completed."
    }
    return "The water test, the checklist and cleanings, and photos from this visit."
}

/// "Version 2 · Oct 20, 2026, 9:42 AM · latest"
public func visitReportVersionLabel(_ v: VisitReportVersion, timeZone: String) -> String {
    "Version \(v.version) · \(visitReportDate(v.sentAt, timeZone: timeZone))\(v.current ? " · latest" : "")"
}

public struct VisitReportSent: Equatable, Sendable {
    public var link: String
    /// What to say, and the message to share when the phone texts it itself.
    public var message: String
    public var share: String?
}

public enum VisitReportChannel: String, Sendable {
    case email, text
    case smsDevice = "sms_device"
}

@MainActor
public enum VisitReportServer {
    /// Send Visit Report. Done work must reach the server first, so the report has it.
    public static func send(
        sync: SyncService, api: WebAPI, jobId: String, channel: VisitReportChannel, to: String?,
        onStep: ((Int) -> Void)? = nil
    ) async throws -> VisitReportSent {
        let email = (to ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if channel == .email, email.wholeMatch(of: /\S+@\S+\.\S+/) == nil {
            throw WebAPI.Failure(description: VisitReportText.enterEmail)
        }
        onStep?(0)
        await sync.syncNow()
        var body: [String: JSONValue] = ["channel": .string(channel.rawValue)]
        if channel == .email { body["to"] = .string(email) }
        onStep?(1)
        let reply = try await api.post("api/jobs/\(jobId)/visit-report", .object(body))
        onStep?(2)
        await sync.syncNow()
        if reply["skipped"] != nil, reply["token"] == nil { throw WebAPI.Failure(description: VisitReportText.notSent) }
        let delivered = reply["delivered"]?.string
        return VisitReportSent(
            link: reply["link"]?.string ?? "",
            message: delivered == "email"
                ? VisitReportText.emailed : delivered == "text" ? VisitReportText.texted : VisitReportText.ready,
            share: delivered == nil ? reply["message"]?.string : nil)
    }
}

/// Visits completed on this phone in a shop that sends visit reports by itself: once the
/// completion has reached the server, POST {automatic: true}. The server decides whether it
/// applies and never sends twice; offline ones wait, and any answer is final.
@MainActor
public final class VisitReportQueue {
    private let kv: KeyValue
    static let key = "visit_report:pending"

    public init(kv: KeyValue) { self.kv = kv }

    public var pending: [String] { kv.getJSON(Self.key, as: [String].self) ?? [] }

    public func add(_ jobId: String) {
        var list = pending.filter { $0 != jobId }
        list.append(jobId)
        kv.setJSON(Self.key, list)
    }

    /// A visit was completed on the phone: queued when it's a maintenance visit in a shop that
    /// sends them by itself.
    public func completed(jobType: JobType, jobId: String, settings: JSONValue?) {
        if jobType == .maintenance && visitReportMode(settings) == .auto { add(jobId) }
    }

    private var running = false

    /// One run at a time; waits on no connection, no sign-in or a server fault (as the shipping
    /// app does); any other answer is final, except the server's "no_photo" (Require a Photo).
    /// `needsPhoto`: the shop requires a photo and this phone has none for the visit
    /// (`visitReportPhotoBlock`): it stays queued, without asking the server, until one is added.
    public func flush(
        _ api: WebAPI, uploading: (String) -> Bool = { _ in false }, needsPhoto: (String) -> Bool = { _ in false }
    ) async {
        guard !running else { return }
        running = true
        defer { running = false }
        // A visit whose photos are still uploading waits, so its report has them.
        for jobId in pending where !uploading(jobId) && !needsPhoto(jobId) {
            do {
                let reply = try await api.post("api/jobs/\(jobId)/visit-report", ["automatic": true])
                if reply["skipped"]?.string == "no_photo" { continue }
            } catch let failure as WebAPI.Failure where failure.tryAgainLater {
                return
            } catch {}
            kv.setJSON(Self.key, pending.filter { $0 != jobId })
        }
    }
}

@MainActor
public enum VisitReportSettingsWrites {
    public static func setMode(_ sync: SyncService, companyId: String, settings: JSONValue?, _ mode: VisitReportMode)
        throws
    {
        var o: [String: JSONValue] = [:]
        if case .object(let current)? = settings { o = current }
        o["visit_reports"] = .string(mode.rawValue)
        try sync.write("company", id: companyId, companyId: companyId, ["settings": .object(o)])
    }

    /// Require a Photo (owner, 2026-10-25): company.settings.require_report_photo.
    public static func setRequirePhoto(_ sync: SyncService, companyId: String, settings: JSONValue?, _ on: Bool)
        throws
    {
        var o: [String: JSONValue] = [:]
        if case .object(let current)? = settings { o = current }
        o["require_report_photo"] = .bool(on)
        try sync.write("company", id: companyId, companyId: companyId, ["settings": .object(o)])
    }
}

/// Why this visit's report can't be sent yet from what's on this phone (core `reportPhotoBlock`,
/// owner 2026-10-25): the shop requires a photo and the visit has none (photos waiting to upload
/// count). Nil when it can be sent.
public func visitReportPhotoBlock(_ store: LocalStore, settings: JSONValue?, jobId: String) -> String? {
    reportPhotoBlock(settings, photos: jobPhotoCount(store, jobId: jobId))
}
