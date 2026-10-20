import Foundation
import SundeckCore
import SundeckSync

/// A report version on the job. Port of ReportRecord in apps/mobile/src/data/reports.ts.
public struct ReportRecord: Decodable, Equatable, Sendable, Identifiable {
    public enum Template: String, Codable, Sendable {
        case homeowner, partner
    }

    public enum Status: String, Codable, Sendable {
        case draft, sent, superseded
    }

    public struct AIDraft: Decodable, Equatable, Sendable {
        public var problems: [NarrativeProblem]?
    }

    public var id: String
    public var jobId: String
    public var templateKey: Template
    public var version: Int
    public var status: Status
    public var finalSections: [FinalSection]?
    public var aiDraft: AIDraft?
    public var model: String?
    public var sentAt: String?
    /// The customer link's token (from `share_link`), once the report has one.
    public var token: String?

    enum CodingKeys: String, CodingKey {
        case id, version, status, model, token
        case jobId = "job_id"
        case templateKey = "template_key"
        case finalSections = "final_sections"
        case aiDraft = "ai_draft"
        case sentAt = "sent_at"
    }
}

/// Something the server's checker found in a draft. Only the message is shown on the phone.
public struct NarrativeProblem: Decodable, Equatable, Sendable {
    public var kind: String?
    public var section: String?
    public var paragraph: Int?
    public var match: String?
    public var message: String
}

/// A signature on the job. Port of SignatureRecord.
public struct SignatureRecord: Decodable, Equatable, Sendable, Identifiable {
    public var id: String
    public var jobId: String
    /// The report version it was finished with; nil until then.
    public var reportId: String?
    public var purpose: String
    public var signerName: String
    public var signerRole: String?
    public var imagePath: String?
    public var signedAt: String

    enum CodingKeys: String, CodingKey {
        case id, purpose
        case jobId = "job_id"
        case reportId = "report_id"
        case signerName = "signer_name"
        case signerRole = "signer_role"
        case imagePath = "image_path"
        case signedAt = "signed_at"
    }
}

/// A job's reports, newest version first, each with its customer link token. Port of useJobReports.
public func jobReports(_ store: LocalStore, jobId: String) -> [ReportRecord] {
    struct Link: Decodable {
        let token: String
        let reportId: String?
        let revokedAt: String?
        enum CodingKeys: String, CodingKey {
            case token
            case reportId = "report_id"
            case revokedAt = "revoked_at"
        }
    }
    let links = decodeJobRows(store, "share_link", jobId, as: Link.self)
    var tokenOf: [String: String] = [:]
    for link in links where link.revokedAt == nil {
        if let report = link.reportId { tokenOf[report] = link.token }
    }
    return decodeJobRows(store, "report", jobId, as: ReportRecord.self)
        .filter { $0.jobId == jobId }
        .sorted { $0.version > $1.version }
        .map {
            var report = $0
            report.token = tokenOf[report.id]
            return report
        }
}

/// A job's signatures, oldest first. Port of useJobSignatures.
public func jobSignatures(_ store: LocalStore, jobId: String) -> [SignatureRecord] {
    decodeJobRows(store, "signature", jobId, as: SignatureRecord.self)
        .filter { $0.jobId == jobId }
        .sorted { $0.signedAt.utf8.lexicographicallyPrecedes($1.signedAt.utf8) }
}

/// Writing and sending reports happen on the Sundeck Pro server (AI, email, PDF). Each call
/// syncs first, so the server has the job as the phone sees it, and again after, so the result
/// comes down. Port of the calls in apps/mobile/src/data/reports.ts, with the same messages.
@MainActor
public struct ReportServer {
    public let sync: SyncService
    public let api: WebAPI
    /// Told each step as it starts (`ReportProgress`): 0 saving, 1 the server, 2 syncing down.
    public var onStep: (@MainActor (Int) -> Void)?

    public init(sync: SyncService, api: WebAPI) {
        self.sync = sync
        self.api = api
    }

    public struct Draft: Equatable, Sendable {
        public var reportId: String
        public var problems: [NarrativeProblem]
    }

    /// Saves the job to the server, then has it write the draft; the report syncs down.
    public func writeDraft(jobId: String, template: ReportRecord.Template) async throws -> Draft {
        onStep?(0)
        await sync.syncNow()
        onStep?(1)
        let reply = try await api.post("api/jobs/\(jobId)/reports", ["template": .string(template.rawValue)])
        onStep?(2)
        await sync.syncNow()
        return Draft(
            reportId: reply["reportId"]?.string ?? "",
            problems: (try? (reply["problems"] ?? []).decode([NarrativeProblem].self)) ?? [])
    }

    public struct Sent: Equatable, Sendable {
        public var link: String
        public var message: String
        public var emailed: Bool
    }

    public enum Channel: String, Sendable {
        case email
        case smsDevice = "sms_device"
    }

    /// Sends a report. Edits must reach the server first, so the customer gets what was approved.
    public func send(reportId: String, channel: Channel, to: String?) async throws -> Sent {
        onStep?(0)
        await sync.syncNow()
        if sync.hasPendingWrites("report", reportId) {
            throw WebAPI.Failure(description: "Your edits haven’t reached the server yet. Try again with signal.")
        }
        try requireUploaded(reportId)
        onStep?(1)
        let reply = try await api.post(
            "api/reports/\(reportId)/send",
            ["channel": .string(channel.rawValue), "to": to.map(JSONValue.string) ?? .null])
        onStep?(2)
        await sync.syncNow()
        return Sent(
            link: reply["link"]?.string ?? "", message: reply["message"]?.string ?? "",
            emailed: reply["emailed"]?.bool ?? false)
    }

    /// A photo, video or signature image of the report's job still uploading: the report would
    /// miss it, so it waits (apps/mobile `requireUploaded`).
    private func requireUploaded(_ reportId: String) throws {
        guard let jobId = (try? sync.store.get("report", reportId))??["job_id"]?.string,
            sync.hasPendingUploads(jobId: jobId)
        else { return }
        throw WebAPI.Failure(description: ReportSendText.uploadsPending)
    }

    /// Finishes a report after the customer signed on this phone (or with Customer Not Here).
    /// The signature and any edits must reach the server first, so the report carries them.
    public func finish(reportId: String, customerAway: Bool) async throws -> String {
        onStep?(0)
        await sync.syncNow()
        if sync.hasPendingWrites("report", reportId) || sync.hasPendingWrites("signature") {
            throw WebAPI.Failure(
                description:
                    "The signature or your edits haven’t reached the server yet. Finish when you have signal.")
        }
        try requireUploaded(reportId)
        onStep?(1)
        let reply = try await api.post("api/reports/\(reportId)/finish", ["customerAway": .bool(customerAway)])
        onStep?(2)
        await sync.syncNow()
        return reply["token"]?.string ?? ""
    }
}

@MainActor
public enum SignatureWrites {
    /// Saves a signature drawn on this phone: the SVG into the media folder, the row and its
    /// upload ticket together. Works offline; the drawing uploads later. Returns its id.
    @discardableResult
    public static func save(
        _ sync: SyncService, companyId: String, jobId: String, purpose: SignaturePurpose, signerName: String,
        signerRole: String, strokes: [SignatureStroke], at place: Coordinate?, quoteId: String? = nil
    ) throws -> String {
        guard let files = sync.media else { throw MediaError("Signatures can’t be saved on this phone.") }
        let id = uuidv7()
        let path = try files.storeSignatureSVG(id, try signatureSvg(strokes))
        let storagePath = signatureStoragePath(companyId, jobId, id)
        let values: Row = [
            "job_id": .string(jobId),
            "quote_id": quoteId.map(JSONValue.string) ?? .null,
            "purpose": .string(purpose.rawValue),
            "signer_name": .string(signerName.trimmingCharacters(in: .whitespacesAndNewlines)),
            "signer_role": blankToNull(signerRole),
            "image_path": .string(storagePath),
            "signed_at": nowISO(),
            "latitude": place.map { .number($0.latitude) } ?? .null,
            "longitude": place.map { .number($0.longitude) } ?? .null,
        ]
        try sync.addSignature(id, companyId: companyId, values, localPath: path, storagePath: storagePath)
        return id
    }
}
