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
