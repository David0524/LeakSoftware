/// One finished section of a report's narrative. Port of the FinalSection type in report.ts.
public struct FinalSection: Codable, Equatable, Sendable {
    public var key: String
    public var title: String
    public var text: String

    public init(key: String, title: String, text: String) {
        self.key = key
        self.title = title
        self.text = text
    }
}

extension SignaturePurpose {
    /// How a signature is named on the report (SIGNATURE_PURPOSE_LABELS in report.ts).
    public var label: String {
        switch self {
        case .inspectionAck: "Inspection acknowledged"
        case .workAuthorization: "Work authorized"
        case .quoteAcceptance: "Quote accepted"
        case .completion: "Work completed"
        }
    }
}

/// The report's title: the job type's own name (`reportTitle`).
public func reportTitle(_ jobType: String?) -> String {
    jobType == "inspection" ? "Pool Inspection Report" : "Leak Detection Report"
}

/// The text a tech sends with the report link (`reportShareText`).
public func reportShareText(_ shopName: String, _ link: String, withQuote: Bool = false, jobType: String? = nil)
    -> String
{
    let what = jobType == "inspection" ? "pool inspection report" : "leak detection report"
    return "\(shopName): your \(what)\(withQuote ? " and repair estimate" : ""): \(link)"
}

/// A report pill's color meaning (`VerdictTone` in report.ts).
public enum VerdictTone: String, Codable, Sendable {
    case pass, attention, leaking
    case notApplicable = "not_applicable"
    case pending
}

/// A test's outcome on the report: its pill's word and color.
public struct TestOutcomeLabel: Codable, Equatable, Sendable {
    public var label: String
    public var tone: VerdictTone

    public init(label: String, tone: VerdictTone) {
        self.label = label
        self.tone = tone
    }
}

/// "Pass", "Fail", "Unclear", or "Recorded" for a test with no outcome (or one this app doesn't
/// know). Port of `testOutcomeLabel` in report.ts.
public func testOutcomeLabel(_ outcome: String?) -> TestOutcomeLabel {
    switch outcome {
    case "pass": TestOutcomeLabel(label: "Pass", tone: .pass)
    case "fail": TestOutcomeLabel(label: "Fail", tone: .leaking)
    case "inconclusive": TestOutcomeLabel(label: "Unclear", tone: .attention)
    default: TestOutcomeLabel(label: "Recorded", tone: .pending)
    }
}

/// The blocks of each report, in order (`REPORT_BLOCKS` in report.ts). The homeowner report lists
/// every test, pass or fail, after What we checked and before Photos (owner, 2026-10-19).
public let reportBlocks: [String: [String]] = [
    "homeowner": [
        "header", "summary", "findings", "diagram", "next_steps", "coverage", "tests", "photos", "signature",
        "footer",
    ],
    "partner": [
        "header", "summary", "findings", "diagram", "tests", "coverage", "photos", "signature", "footer",
    ],
]

// MARK: - Saved reports (owner, 2026-10-20: "a copy/paste essentially that the tech uses each time")

/// The report sections a saved report can hold text for, in report order (`SAVED_REPORT_SECTIONS`).
public let savedReportSectionList: [(key: String, title: String)] = [
    ("summary", "Summary"), ("findings", "What we found"), ("next_steps", "What happens next"),
]

/// A saved report's text by section key, from its stored `sections` (unknown keys and blanks
/// dropped; `savedReportSections`).
public func savedReportSections(_ raw: JSONValue?) -> [String: String] {
    guard case .object(let o)? = raw else { return [:] }
    var out: [String: String] = [:]
    for (key, _) in savedReportSectionList {
        if case .string(let v)? = o[key] {
            let t = ECMA.trim(v)
            if !t.isEmpty { out[key] = t }
        }
    }
    return out
}

/// Use Saved Report: the draft's sections with the saved text in place, word for word, and the
/// titles of the sections whose own different text it replaces (asked about first).
public func applySavedReport(_ sections: [FinalSection], _ saved: JSONValue?) -> (
    sections: [FinalSection], replaces: [String]
) {
    let text = savedReportSections(saved)
    var replaces: [String] = []
    let next = sections.map { s -> FinalSection in
        guard let t = text[s.key] else { return s }
        let own = ECMA.trim(s.text)
        if !own.isEmpty && own != t { replaces.append(s.title) }
        return FinalSection(key: s.key, title: s.title, text: t)
    }
    return (next, replaces)
}

/// "Replace the text in Summary and What we found?"
public func replaceSavedReportQuestion(_ titles: [String]) -> String {
    let list =
        titles.count <= 1
        ? (titles.first ?? "") : "\(titles.dropLast().joined(separator: ", ")) and \(titles.last!)"
    return "Replace the text in \(list)?"
}

/// Save as Saved Report: the draft's text by section, blanks left out.
public func savedReportFrom(_ sections: [FinalSection]) -> [String: String] {
    var o: [String: JSONValue] = [:]
    for s in sections { o[s.key] = .string(s.text) }
    return savedReportSections(.object(o))
}
