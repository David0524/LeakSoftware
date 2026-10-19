import Foundation
import Observation
import SundeckCore
import SundeckSync

// The job's Report tab (BUILD_PLAN 6.2 to 6.5): signatures, then write, edit, and send the
// report. Port of apps/mobile/src/features/report/ReportTab.tsx. `ReportTabModel` is what the
// tab shows for the job's rows; `ReportFlow` holds what the tech is doing (edits, recipients,
// a server call in flight) and makes the writes and server calls at the moments Expo does.

/// A report the tech can pick ("Report for"). The partner report is gone from the phone
/// (owner, 2026-10-18), so only the homeowner one shows, unless the shop turned it off.
public struct ReportTemplateOption: Equatable, Sendable, Identifiable {
    public var value: ReportRecord.Template
    public var label: String
    /// The shop's own name for it (report_template.name).
    public var name: String?

    public var id: String { value.rawValue }
}

/// One signature on the job, as its row shows it.
public struct SignatureRow: Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    /// "Homeowner", shown muted after the name; nil when not given.
    public var role: String?
    /// "Inspection acknowledged · Sun, Oct 11, 9:00 AM" (the website's schedule format).
    public var subtitle: String
    /// The drawing in storage, and its copy on this phone while it waits to upload.
    public var imagePath: String?
    public var removeLabel: String { "Remove signature of \(name)" }
    public var removeTitle: String { "Remove \(name)’s signature?" }
}

/// One sent or replaced version.
public struct VersionRow: Equatable, Sendable, Identifiable {
    public var id: String
    public var version: Int
    /// "Version 2 · 10/19/26 · replaced"
    public var label: String
    public var superseded: Bool
    /// The customer's page for this version, when it has a link.
    public var url: URL?
    /// Its PDF, when it has a link.
    public var pdfURL: URL? { url?.appendingPathComponent("pdf") }
    public var viewLabel: String { "View version \(version)" }
}

/// What the Report tab shows for one job and template.
public struct ReportTabModel: Equatable, Sendable {
    public static let offlineNotice =
        "This app isn’t connected to the Sundeck Pro server, so reports can’t be written here. Use the office website."
    public static let noSignatures =
        "None yet. The customer signs at the end of the report: write the draft, then Review with Customer."
    public static let intro =
        "Write Draft fills in the report from this job’s checklist, tests, and findings. Read and edit it before sending."
    public static let signWorkAuthorization = "Sign Work Authorization"
    public static let reviewWithCustomer = "Review with Customer"
    public static let finishReport = "Finish Report"
    public static let sendWithoutSignature = "Send Without a Signature"
    public static let sendWithoutSignatureNote = "Sending saves your edits and locks this version."
    public static let finishedNote = "Send it to the customer, or download the PDF."
    public static let textedLabel = "Message to text the customer"
    public static let otherEmailsHint = "They get the report too. Separate with spaces."

    public var templates: [ReportTemplateOption]
    public var template: ReportRecord.Template
    /// Reports are written on the server; without one the tab says to use the website.
    public var online: Bool
    /// The job's detection tip shows on leak detection jobs.
    public var showsTip: Bool
    public var signatures: [SignatureRow]
    /// The shop uses its own work authorization sheet: the header offers Sign Work Authorization.
    public var ownSheet: Bool
    public var draft: ReportRecord?
    /// Sent and replaced versions of this template, newest first.
    public var sent: [ReportRecord]
    /// The newest version that's finished (sent, not replaced).
    public var finished: ReportRecord?
    /// Signed on this phone but not yet part of a finished version (signed offline).
    public var waitingSigners: [String]
    public var versions: [VersionRow]
    /// The card's title: the template's name ("Homeowner report").
    public var templateName: String
    public var customerEmail: String
    public var customerOtherEmails: String
    public var hasCustomer: Bool

    public init(
        store: LocalStore, companyId: String, settings: JSONValue?, job: JobView,
        template: ReportRecord.Template = .homeowner, online: Bool = true, webURL: URL? = AppConfig.webURL,
        timeZone: TimeZone = .current, locale: Locale = .current, now: Date = Date()
    ) {
        struct TemplateRow: Decodable {
            let key: String
            let name: String?
            let enabled: Bool?
        }
        let rows = decodeRows(store, "report_template", companyId, as: TemplateRow.self)
        let byKey = Dictionary(rows.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })
        // The homeowner report only (owner, 2026-10-18: "Partner report should be gone").
        templates = [ReportRecord.Template.homeowner]
            .filter { byKey[$0.rawValue]?.enabled != false }
            .map {
                ReportTemplateOption(
                    value: $0, label: $0 == .homeowner ? "Homeowner" : "Partner", name: byKey[$0.rawValue]?.name)
            }
        self.template = template
        self.online = online
        showsTip = job.type == .detection

        let signatureRecords = jobSignatures(store, jobId: job.id)
        signatures = signatureRecords.map { s in
            let purpose = SignaturePurpose(rawValue: s.purpose)?.label ?? s.purpose
            let when = (try? formatSchedule(s.signedAt, now, timeZone.identifier)) ?? s.signedAt
            let role = s.signerRole?.trimmingCharacters(in: .whitespacesAndNewlines)
            return SignatureRow(
                id: s.id, name: s.signerName, role: role?.isEmpty == false ? role : nil,
                subtitle: "\(purpose) · \(when)", imagePath: s.imagePath)
        }
        ownSheet = enabledSignaturePurposes(settings).contains { $0.value == .workAuthorization }

        let reports = jobReports(store, jobId: job.id)
        draft = reports.first { $0.templateKey == template && $0.status == .draft }
        sent = reports.filter { $0.templateKey == template && $0.status != .draft }
        finished = sent.first { $0.status == .sent }
        waitingSigners = signatureRecords.filter { $0.reportId == nil && $0.purpose != "quote_acceptance" }
            .map(\.signerName)
        templateName = byKey[template.rawValue]?.name ?? "Homeowner report"
        versions = sent.map { r in
            var label = "Version \(r.version)"
            if let at = r.sentAt { label += " · " + mediumDate(at, timeZone: timeZone.identifier, time: true) }
            if r.status == .superseded { label += " · replaced" }
            return VersionRow(
                id: r.id, version: r.version, label: label, superseded: r.status == .superseded,
                url: r.token.flatMap { token in webURL.map { reportURL($0, token) } })
        }
        let customer = job.customer
        hasCustomer = customer != nil
        customerEmail = customer?["email"]?.string ?? ""
        customerOtherEmails = (customer?["cc_emails"]?.array ?? []).compactMap(\.string).joined(separator: " ")
    }

    /// The draft has text to read and edit (the server wrote it).
    public var hasDraftText: Bool { draft?.finalSections != nil }
    public var sections: [FinalSection] { draft?.finalSections ?? [] }
    public var showsTemplatePicker: Bool { templates.count > 1 }

    public var writeTitle: String { hasDraftText ? "Write the Draft Again" : "Write Draft" }
    /// Write Draft is the main action until there's a draft; then writing again is secondary.
    public var writeIsPrimary: Bool { !hasDraftText }
    /// Before a draft, the customer can still review and sign (the server writes it then).
    public var showsReviewBeforeDraft: Bool { !hasDraftText }

    public var problemsText: String? {
        let problems = draft?.aiDraft?.problems ?? []
        guard !problems.isEmpty else { return nil }
        return "Check these before sending:\n" + problems.map { "• \($0.message)" }.joined(separator: "\n")
    }

    public var finishTitle: String? { draft.map { "Finish version \($0.version)" } }
    /// Someone signed on this phone: Finish Report locks the version with the signature.
    public var finishesWithSignature: Bool { !waitingSigners.isEmpty }
    /// The draft folded away: "Draft version 2 is ready to read, edit, and review with the customer."
    public var collapsedText: String? {
        guard hasDraftText, let draft else { return nil }
        return "Draft version \(draft.version) is ready to read, edit, and review with the customer."
    }

    /// The title row's link to the newest finished version ("View version 2").
    public var viewLatest: VersionRow? { versions.first { !$0.superseded && $0.url != nil } }

    public var finishNote: String {
        waitingSigners.isEmpty
            ? "Hand the phone to the customer: they read the report and sign at the bottom. Signing locks this version; changes after that go out as a new version."
            : "Signed by \(waitingSigners.joined(separator: ", ")). Finish the report to lock this version with the signature."
    }

    public var finishedTitle: String? { finished.map { "Version \($0.version) is finished" } }
    /// The finished version's Send by Email is the main action when there's no draft to work on.
    public var finishedEmailIsPrimary: Bool { !hasDraftText }

    public func pdfURL(webURL: URL? = AppConfig.webURL) -> URL? {
        guard let token = finished?.token, let webURL else { return nil }
        return reportURL(webURL, token).appendingPathComponent("pdf")
    }
}

/// The customer's report page: {web}/r/{token}.
public func reportURL(_ webURL: URL, _ token: String) -> URL {
    webURL.appendingPathComponent("r").appendingPathComponent(token)
}

/// A timestamp in the phone's time zone and locale, as `toLocaleString`/`toLocaleDateString` do.
func reportDateText(_ iso: String, time: Bool, _ timeZone: TimeZone, _ locale: Locale) -> String {
    guard let date = parseISODate(iso) else { return iso }
    let formatter = DateFormatter()
    formatter.locale = locale
    formatter.timeZone = timeZone
    formatter.dateStyle = .short
    formatter.timeStyle = time ? .short : .none
    return formatter.string(from: date)
}

/// What the tech is doing on the Report tab, and the writes and server calls it makes.
@MainActor @Observable
public final class ReportFlow {
    public enum Action: Equatable, Sendable { case draft, email, text, finish }
    /// Where an error shows: next to the button that caused it, so it is on screen.
    public enum Place: Equatable, Sendable { case draft, send, finish }

    public struct Failure: Equatable, Sendable {
        public var at: Place
        public var text: String
    }

    public var template: ReportRecord.Template = .homeowner
    /// Section text being edited, by section key; saved together when a field loses focus.
    public var edits: [String: String] = [:]
    public var busy: Action?
    public var error: Failure?
    public var message: String?
    /// The customer email as typed; nil shows the customer's own.
    public var to: String?
    /// Other emails as typed; nil shows the customer's saved ones.
    public var otherEmails: String?
    /// A text message with the report link, for the share sheet.
    public var share: String?
    /// The last text message sent, shown with Copy Message after the share sheet closes.
    public var texted: String?
    /// A local write that failed.
    public var saveError: String?

    public let sync: SyncService
    public let companyId: String
    public let jobId: String

    public init(sync: SyncService, companyId: String, jobId: String, settings: JSONValue = .null) {
        self.sync = sync
        self.companyId = companyId
        self.jobId = jobId
        self.settings = settings
    }

    /// The draft as the phone has it now (nil once it's sent or replaced).
    private var draft: ReportRecord? {
        jobReports(sync.store, jobId: jobId).first { $0.templateKey == template && $0.status == .draft }
    }

    private var customer: Row? {
        (try? jobViews(sync.store, companyId: companyId))?.first { $0.id == jobId }?.customer
    }

    public func emailText(_ model: ReportTabModel) -> String { to ?? model.customerEmail }
    public func otherEmailsText(_ model: ReportTabModel) -> String { otherEmails ?? model.customerOtherEmails }
    public func sectionText(_ section: FinalSection) -> String { edits[section.key] ?? section.text }

    /// Saves every pending edit in one write of `final_sections`, so no edit overwrites
    /// another. Only a draft is edited: a sent report never changes.
    public func saveEdits() {
        guard !edits.isEmpty else { return }
        guard let draft, let sections = draft.finalSections else {
            edits = [:]
            return
        }
        let next = sections.map { s in
            edits[s.key].map {
                FinalSection(key: s.key, title: s.title, text: $0.trimmingCharacters(in: .whitespacesAndNewlines))
            } ?? s
        }
        do {
            try sync.write("report", id: draft.id, companyId: companyId, ["final_sections": try json(next)])
            edits = [:]
        } catch {
            saveError = String(describing: error)
        }
    }

    /// Other emails are saved on the customer, so later reports and quotes use them too.
    public func saveOtherEmails() {
        guard let typed = otherEmails else { return }
        otherEmails = nil
        guard let customer, let id = customer["id"]?.string else { return }
        let next = splitEmails(typed)
        let current = (customer["cc_emails"]?.array ?? []).compactMap(\.string)
        guard next.joined(separator: " ") != current.joined(separator: " ") else { return }
        do {
            try sync.write("customer", id: id, companyId: companyId, ["cc_emails": .array(next.map(JSONValue.string))])
        } catch {
            saveError = String(describing: error)
        }
    }

    /// Removed signatures leave later versions; finished versions keep their own copy.
    public func removeSignature(_ id: String) {
        do {
            try sync.write("signature", id: id, companyId: companyId, ["deleted_at": nowISO()])
        } catch {
            saveError = String(describing: error)
        }
    }

    /// Picking another report keeps this one's edits and starts the next one clean.
    public func switchTemplate(_ next: ReportRecord.Template) {
        saveEdits()
        template = next
        edits = [:]
        message = nil
        error = nil
    }

    /// Writing again replaces the draft's text, so the tab asks first when there's text to lose.
    public var writeNeedsConfirmation: Bool { draft?.finalSections != nil }

    /// The shop's settings, for the photo rule.
    public var settings: JSONValue = .null

    /// Whether the last error was the photo rule's, so Take Photo shows beside it.
    public var photoNeeded: Bool { error?.text == finishPhotoMessage }

    /// Review with Customer: stopped when the job still needs its pool photo (the sign-off would
    /// finish the report). Returns whether it may open.
    public func canReview() -> Bool {
        error = nil
        if let block = finishPhotoBlock(sync.store, settings: settings, jobId: jobId) {
            error = Failure(at: .finish, text: block)
            return false
        }
        return true
    }

    private func checkFinishPhoto() throws {
        if let block = finishPhotoBlock(sync.store, settings: settings, jobId: jobId) {
            throw WebAPI.Failure(description: block)
        }
    }

    /// The share sheet closed after a text: the report went out.
    public func shareFinished() {
        texted = share
        share = nil
        message = "Report sent."
    }

    /// Writes the draft, finishes it, or sends a version (`reportId`, else the draft).
    public func run(_ action: Action, reportId: String? = nil, server: ReportServer) async {
        busy = action
        error = nil
        message = nil
        defer { busy = nil }
        do {
            switch action {
            case .draft:
                let result = try await server.writeDraft(jobId: jobId, template: template)
                edits = [:]
                let count = result.problems.count
                message =
                    count > 0
                    ? "Draft written. \(count) thing\(count == 1 ? "" : "s") to check below."
                    : "Draft written. Read it over and edit anything before sending."
            case .finish:
                let id = reportId ?? draft?.id
                saveEdits()
                try checkFinishPhoto()
                guard let id else { throw WebAPI.Failure(description: "There’s no draft to finish.") }
                _ = try await server.finish(reportId: id, customerAway: false)
                message = "Report finished. Send it to the customer below."
            case .email, .text:
                let id = reportId ?? draft?.id
                let customer = self.customer
                let email = (to ?? customer?["email"]?.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                saveEdits()
                saveOtherEmails()
                if action == .email, email.wholeMatch(of: /\S+@\S+\.\S+/) == nil {
                    throw WebAPI.Failure(description: "Enter the customer’s email.")
                }
                guard let id else { throw WebAPI.Failure(description: "There’s no report to send.") }
                // Sending a draft finishes it first; a finished version goes out as it is.
                if jobReports(sync.store, jobId: jobId).first(where: { $0.id == id })?.status == .draft {
                    try checkFinishPhoto()
                }
                let sent = try await server.send(
                    reportId: id, channel: action == .email ? .email : .smsDevice,
                    to: action == .email ? email : customer?["phone"]?.string)
                if action == .text {
                    share = sent.message
                } else {
                    message = "Sent to \(email)."
                }
            }
        } catch {
            let text = (error as? WebAPI.Failure)?.description ?? String(describing: error)
            self.error = Failure(at: action == .draft ? .draft : action == .finish ? .finish : .send, text: text)
        }
    }
}
