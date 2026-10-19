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
