import Foundation
import SundeckCore
import SundeckSync

// Finish Report, Send by Email and Send by Text without signal (owner, 2026-10-20;
// docs/design/2026-10-20-one-handed-use.md, item 6): the buttons stay enabled offline. A tap
// keeps the request on the phone and says "Will send when you’re back online."; it runs once the
// signal is back and the job's changes have reached the server, the same way automatic visit
// reports are queued (`VisitReportQueue`). Write Draft still needs a connection.

public enum ReportSendText {
    public static let willSend = "Will send when you’re back online."
    /// Online, but a photo or the signature is still uploading: it waits for them (apps/mobile
    /// `UPLOADS_QUEUED_MESSAGE`).
    public static let willSendAfterUploads = "Will send when the photos finish uploading."
    /// The server call refused on the phone while the job's files are still uploading.
    public static let uploadsPending = "The photos haven’t finished uploading yet. Try again in a moment."
}

/// One report request kept on the phone until it can run.
public struct ReportSendRequest: Codable, Equatable, Sendable {
    public enum Action: String, Codable, Sendable { case finish, email, text }

    public var jobId: String
    public var reportId: String
    public var action: Action
    /// The customer's email (Send by Email) or phone (Send by Text).
    public var to: String?

    public init(jobId: String, reportId: String, action: Action, to: String?) {
        self.jobId = jobId
        self.reportId = reportId
        self.action = action
        self.to = to
    }
}

/// Report requests made offline, run after a sync once nothing is waiting to upload. The server
/// decides; any answer but no connection is final. A text's message waits on the phone for the
/// tech to send from the report card (Copy Message or Share), since the phone sends texts itself.
@MainActor
public final class ReportSendQueue {
    private let kv: KeyValue
    static let key = "report_send:pending"
    static let textsKey = "report_send:texts"
    static let failuresKey = "report_send:failures"

    public init(kv: KeyValue) { self.kv = kv }

    /// Read entry by entry: one this version can't read (or a damaged one) is skipped, not the
    /// whole list.
    public var pending: [ReportSendRequest] {
        (kv.getJSON(Self.key, as: [JSONValue].self) ?? []).compactMap { try? $0.decode(ReportSendRequest.self) }
    }

    /// The same request was done online (Send tapped again with signal): it doesn't go twice.
    public func forget(reportId: String, action: ReportSendRequest.Action) {
        let list = pending
        let kept = list.filter { !($0.reportId == reportId && $0.action == action) }
        if kept.count != list.count { kv.setJSON(Self.key, kept) }
    }

    private var running = false

    /// Requests still waiting for this job.
    public func pending(jobId: String) -> [ReportSendRequest] { pending.filter { $0.jobId == jobId } }

    /// Keeps a request; the same action on the same report replaces the older one.
    public func add(_ request: ReportSendRequest) {
        var list = pending.filter { !($0.reportId == request.reportId && $0.action == request.action) }
        list.append(request)
        kv.setJSON(Self.key, list)
        var failures = self.failures
        failures[request.jobId] = nil
        kv.setJSON(Self.failuresKey, failures)
    }

    /// A text that went through while away from the report card: its message, by job.
    public func readyText(jobId: String) -> String? { texts[jobId] }

    public func takeReadyText(jobId: String) -> String? {
        var all = texts
        let text = all.removeValue(forKey: jobId)
        kv.setJSON(Self.textsKey, all)
        return text
    }

    /// Why the last queued request for a job didn't go (the server's words).
    public func failure(jobId: String) -> String? { failures[jobId] }

    private var texts: [String: String] { kv.getJSON(Self.textsKey, as: [String: String].self) ?? [:] }
    private var failures: [String: String] { kv.getJSON(Self.failuresKey, as: [String: String].self) ?? [:] }

    /// Runs the requests in order; stops at the first one that should wait (no connection, no
    /// sign-in, the server busy or at fault). Only one run at a time, so two syncs finishing
    /// together never send twice. A text runs only with the app in front (`canText`), since the
    /// tech sends it from the phone; in the background it waits.
    /// A job whose files are still uploading (`uploading`) waits, so its report has them.
    public func flush(_ api: WebAPI, canText: Bool = true, uploading: (String) -> Bool = { _ in false }) async {
        guard !running else { return }
        running = true
        defer { running = false }
        for request in pending {
            if request.action == .text && !canText { continue }
            if uploading(request.jobId) { continue }
            do {
                switch request.action {
                case .finish:
                    _ = try await api.post("api/reports/\(request.reportId)/finish", ["customerAway": false])
                case .email, .text:
                    let reply = try await api.post(
                        "api/reports/\(request.reportId)/send",
                        [
                            "channel": .string(request.action == .email ? "email" : "sms_device"),
                            "to": request.to.map(JSONValue.string) ?? .null,
                        ])
                    if request.action == .text, let message = reply["message"]?.string, !message.isEmpty {
                        var all = texts
                        all[request.jobId] = message
                        kv.setJSON(Self.textsKey, all)
                    }
                }
            } catch let failure as WebAPI.Failure where failure.tryAgainLater {
                return
            } catch {
                var all = failures
                all[request.jobId] = (error as? WebAPI.Failure)?.description ?? userMessage(error)
                kv.setJSON(Self.failuresKey, all)
            }
            // Only this exact request: a newer one queued meanwhile still goes.
            kv.setJSON(Self.key, pending.filter { $0 != request })
        }
    }
}
