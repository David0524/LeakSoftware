import Foundation
import SundeckCore
import SundeckSync

/// A signature being taken: what it is for, who signs, and the drawing. Shared by the signature
/// screen and the review screen's sign-off, which differ only in their words. Port of the state
/// in apps/mobile/src/app/(app)/jobs/[id]/signature.tsx and review.tsx.
public struct SignatureForm: Equatable, Sendable {
    public enum Kind: Equatable, Sendable {
        /// The Signature screen; with a quote, the customer accepts it on site.
        case signature(quoteId: String?)
        /// The end of the visit, signed after the customer reads the report.
        case review
    }

    public let kind: Kind
    /// The purposes this screen offers, in order.
    public let purposes: [SignaturePurposeOption]
    public var purpose: SignaturePurpose?
    /// What was typed; nil until then, so the field shows the customer's name.
    public var name: String?
    /// The job's customer, kept current as the page reloads.
    public var customerName: String?
    public var role = ""
    public var strokes: [SignatureStroke] = []
    public var error: String?

    public init(_ kind: Kind, settings: JSONValue?, customerName: String?) {
        self.kind = kind
        self.customerName = customerName
        switch kind {
        case .signature(let quoteId):
            purposes = Self.signaturePurposes(quoteId: quoteId, settings: settings)
        case .review:
            purposes = reportSignOffPurposes(settings)
        }
        purpose = purposes.first?.value
    }

    /// The Signature screen's purposes: quote acceptance with a quote, else work authorization
    /// when the shop turned it on. The visit's sign-off is signed at the end of the report.
    public static func signaturePurposes(quoteId: String?, settings: JSONValue?) -> [SignaturePurposeOption] {
        if quoteId != nil {
            return [SignaturePurposeOption(value: .quoteAcceptance, label: SignaturePurpose.quoteAcceptance.label)]
        }
        return enabledSignaturePurposes(settings).filter { $0.value == .workAuthorization }
    }

    /// The form for a job on this phone; nil when the job isn't here. The signer defaults to the
    /// job's customer (the bill-to customer, else the property's).
    public static func forJob(_ kind: Kind, _ store: LocalStore, jobId: String, settings: JSONValue?) -> SignatureForm?
    {
        guard let job = try? store.get("job", jobId) else { return nil }
        return SignatureForm(kind, settings: settings, customerName: jobCustomerName(store, job))
    }

    public var quoteId: String? {
        if case .signature(let quoteId) = kind { return quoteId }
        return nil
    }

    /// Signatures are off in settings: the Signature screen says so instead of a form.
    public var isOff: Bool { purposes.isEmpty }
    /// A picker only when there's a choice.
    public var showsPicker: Bool { purposes.count > 1 }
    /// With a single purpose, the Signature screen names it above the fields.
    public var heading: String? { purposes.count == 1 ? purposes[0].label : nil }

    public var pickerLabel: String { kind == .review ? "Signing for" : "Signature for" }
    public var nameLabel: String { kind == .review ? "Your name" : "Signer’s name" }
    public static let rolePlaceholder = "Homeowner, property manager…"

    /// The name field's text: what was typed, else the customer's name.
    public var nameText: String {
        get { name ?? customerName ?? "" }
        set { name = newValue }
    }

    public var signer: String { nameText.trimmingCharacters(in: .whitespacesAndNewlines) }

    public var canClear: Bool { !strokes.isEmpty }

    /// A stroke ended: the pad's strokes so far. Clears the message.
    public mutating func draw(_ strokes: [SignatureStroke]) {
        self.strokes = strokes
        error = nil
    }

    public mutating func clear() { strokes = [] }

    /// The first problem, in Expo's words, or nil when it can be saved.
    public var problem: String? {
        if purpose == nil { return "Choose what this signature is for." }
        let review = kind == .review
        if signer.isEmpty { return review ? "Enter your name." : "Enter the signer’s name." }
        if inkLength(strokes) < minInk {
            return review ? "Sign in the box with your finger." : "Ask them to sign in the box."
        }
        return nil
    }

    /// Shows the problem; true when there's none.
    public mutating func validate() -> Bool {
        error = problem
        return error == nil
    }

    /// Saves the signature on the phone (the SVG, the row and its upload ticket). Call after
    /// `validate()`. Works offline.
    @MainActor @discardableResult
    public func save(_ sync: SyncService, companyId: String, jobId: String, at place: Coordinate?) throws -> String {
        guard let purpose else { throw SignatureFormError("Choose what this signature is for.") }
        return try SignatureWrites.save(
            sync, companyId: companyId, jobId: jobId, purpose: purpose, signerName: signer, signerRole: role,
            strokes: strokes, at: place, quoteId: quoteId)
    }
}

/// The name of a job's customer: the bill-to customer, else the property's.
func jobCustomerName(_ store: LocalStore, _ job: Row) -> String? {
    let property = job["property_id"]?.string.flatMap { try? store.get("property", $0) }
    let customerId = job["bill_to_customer_id"]?.string ?? property?["customer_id"]?.string
    return customerId.flatMap { try? store.get("customer", $0) }?["name"]?.string
}

public struct SignatureFormError: Error, Equatable, CustomStringConvertible {
    public let description: String
    public init(_ description: String) { self.description = description }
}

/// What the review screen shows, worked out from the phone's data. Port of review.tsx.
public struct ReviewSummary: Sendable {
    public struct FindingLine: Equatable, Sendable, Identifiable {
        public var id: String
        /// "1. Return 3 line break"
        public var title: String
        /// Severity, item and where, joined with " · ".
        public var detail: String
    }

    public struct TestLine: Equatable, Sendable, Identifiable {
        public var id: String
        public var name: String
        public var outcome: Outcome?
    }

    public var companyName: String
    public var maintenance: Bool
    public var customerName: String?
    public var address: String
    public var sections: [FinalSection]
    public var tally: ChecklistTally
    public var findings: [FindingLine]
    public var tests: [TestLine]
    public var purposes: [SignaturePurposeOption]
    /// The draft this screen finishes; nil offline or before it's written.
    public var draftId: String?

    /// nil when the job isn't on this phone.
    public init?(
        _ store: LocalStore, companyId: String, companyName: String, settings: JSONValue?, jobId: String,
        template: ReportRecord.Template = .homeowner
    ) {
        guard let job = try? store.get("job", jobId) else { return nil }
        let property = job["property_id"]?.string.flatMap { try? store.get("property", $0) }
        let customerId = job["bill_to_customer_id"]?.string ?? property?["customer_id"]?.string
        let customer = customerId.flatMap { try? store.get("customer", $0) }
        let view = JobView(id: jobId, job: job, property: property, customer: customer)
        let insp = JobInspection(store, jobId: jobId)
        let config = InspectionConfig(store, companyId: companyId)
        let draft = jobReports(store, jobId: jobId).first { $0.templateKey == template && $0.status == .draft }

        self.companyName = companyName
        maintenance = view.type == .maintenance
        customerName = customer?["name"]?.string
        address = view.decodedProperty.map(formatAddress) ?? ""
        sections = (draft?.finalSections ?? []).filter {
            !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        tally = checklistTally(insp.components, insp.results)
        findings = insp.findings.sorted { $0.id < $1.id }.enumerated().map { i, f in
            let parts = [
                config.severityByKey[f.severityKey]?.name,
                f.jobComponentId.flatMap { insp.componentById[$0]?.label },
                f.locationText,
            ]
            return FindingLine(
                id: f.id, title: "\(i + 1). \(f.title)",
                detail: parts.compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
        }
        tests = insp.tests.map {
            TestLine(id: $0.id, name: config.testTypeById[$0.testTypeId]?.name ?? "Test", outcome: $0.outcome)
        }
        purposes = reportSignOffPurposes(settings)
        draftId = draft?.id
    }

    public static let intro = "Please read your report. Sign at the bottom to confirm the visit."
    public static let summaryLater =
        "The written summary is added before the report is sent. Below is what was checked and found today."
    public static let awayNote =
        "For the tech: nobody here to sign? Finish the report without a signature. It will say the customer wasn’t present."

    public var title: String { maintenance ? "Service Report" : "Leak Detection Report" }
    public var customerText: String { customerName ?? "Customer" }

    public var tallyText: String {
        maintenance
            ? "\(tally.pass) done · \(tally.attention) need attention · \(tally.notApplicable) skipped"
            : "\(tally.pass) not leaking · \(tally.attention) attention · \(tally.leaking) leaking · \(tally.notApplicable) not applicable"
    }

    /// "2 still to do" under the tally, while items are left.
    public var pendingText: String? { tally.pending > 0 ? "\(tally.pending) still to do" : nil }

    /// Signing waits for the checklist.
    public var pendingNotice: String? {
        guard tally.pending > 0 else { return nil }
        let items = tally.pending == 1 ? "item is" : "items are"
        return "\(tally.pending) checklist \(items) still to do. Finish the checklist, then come back to sign."
    }

    /// The sign-off fields and pad: the checklist is done and the shop takes signatures.
    public var showsSignOff: Bool { tally.pending == 0 && !purposes.isEmpty }
    /// Sign (or Finish Report) and Customer Not Here, once the checklist is done.
    public var showsButtons: Bool { tally.pending == 0 }
    public var signTitle: String { purposes.isEmpty ? "Finish Report" : "Sign" }
    public var showsCustomerNotHere: Bool { !purposes.isEmpty }

    /// What the customer agrees to, above the box.
    public func statement(_ purpose: SignaturePurpose) -> String {
        signatureStatement(purpose, companyName, address.isEmpty ? nil : address)
    }
}

/// Sign, Finish Report or Customer Not Here on the review screen. Port of `finish` in review.tsx.
@MainActor
public enum ReviewFinish {
    public enum Result: Equatable, Sendable {
        /// Go back to the job.
        case back
        /// Stay, with the form's error shown.
        case stay
    }

    /// With `photoBlock` (the job still needs its pool photo) nothing is saved and it stays.
    /// The signature is saved on the phone first, so it's kept without signal; then the report
    /// is finished when its draft exists. A signed report that can't be finished yet goes back
    /// (the Report tab offers Finish Report); Customer Not Here stays and says why.
    public static func run(
        _ form: inout SignatureForm, customerAway: Bool, summary: ReviewSummary, sync: SyncService,
        companyId: String, jobId: String, photoBlock: String? = nil, location: () async -> Coordinate?,
        finish: (_ reportId: String, _ customerAway: Bool) async throws -> Void
    ) async -> Result {
        form.error = nil
        // The shop's photo rule (`finishPhotoBlock`): stop before the customer signs, so the
        // signature isn't saved twice once the photo is taken.
        if let photoBlock {
            form.error = photoBlock
            return .stay
        }
        if !customerAway && !summary.purposes.isEmpty {
            guard form.validate() else { return .stay }
        }
        if customerAway && summary.draftId == nil {
            form.error = "Write the draft first, then finish it here."
            return .stay
        }
        if !customerAway && form.purpose != nil && !summary.purposes.isEmpty {
            do {
                let place = await location()
                try form.save(sync, companyId: companyId, jobId: jobId, at: place)
            } catch {
                form.error = String(describing: error)
                return .stay
            }
        }
        guard let draftId = summary.draftId else { return .back }
        do {
            try await finish(draftId, customerAway)
            return .back
        } catch {
            guard customerAway else { return .back }
            form.error = String(describing: error)
            return .stay
        }
    }
}

/// A saved signature drawing, read back from its SVG (`signatureSvg`) to show on the Wrap-Up
/// section: the view box and each stroke's path.
public struct SignatureDrawing: Equatable, Sendable {
    /// x, y, width, height.
    public var viewBox: [Double]
    /// Each stroke's `d`.
    public var paths: [String]

    /// The local copy of a signature drawn on this phone: media/signature-{id}.svg.
    public static func localPath(_ signatureId: String) -> String {
        "\(MediaFiles.folder)/signature-\(signatureId).svg"
    }
}

/// Reads the view box and paths of a signature SVG; nil when it has neither.
public func parseSignatureSVG(_ svg: String) -> SignatureDrawing? {
    guard let box = svg.firstMatch(of: /viewBox="([^"]+)"/) else { return nil }
    let numbers = box.1.split(whereSeparator: { $0 == " " || $0 == "," }).compactMap { Double($0) }
    guard numbers.count == 4, numbers[2] > 0, numbers[3] > 0 else { return nil }
    let paths = svg.matches(of: /<path[^>]*\sd="([^"]*)"/).map { String($0.1) }
    guard !paths.isEmpty else { return nil }
    return SignatureDrawing(viewBox: numbers, paths: paths)
}
