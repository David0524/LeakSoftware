import Foundation

// Signatures captured on the phone (BUILD_PLAN 6.4). Drawn strokes are saved as a small SVG
// file next to the job's photos, so they work offline and look sharp in the PDF.

/// What a signature is for. Port of signature.ts.
public enum SignaturePurpose: String, Codable, CaseIterable, Sendable {
    case inspectionAck = "inspection_ack"
    case workAuthorization = "work_authorization"
    case quoteAcceptance = "quote_acceptance"
    case completion
}

/// One finger stroke: points in pad pixels.
public typealias SignatureStroke = [SIMD2<Double>]

/// What the report says when the tech finishes it with Customer Not Here.
public let unsignedCustomerAway = "Customer not present"

public struct SignaturePurposeOption: Codable, Equatable, Sendable {
    public let value: SignaturePurpose
    public let label: String
}

/// The purposes the shop turned on in settings, in a fixed order. Quote acceptance is signed
/// from the quote itself, so it is left out here.
public func enabledSignaturePurposes(_ settings: JSONValue?) -> [SignaturePurposeOption] {
    let on: JSONValue =
        switch settings?["signature_purposes"] {
        case nil, .null?: .object(["inspection_ack": .bool(true)])
        case let value?: value
        }
    return SignaturePurpose.allCases
        .filter { ECMA.truthy(on[$0.rawValue]) && $0 != .quoteAcceptance }
        .map { SignaturePurposeOption(value: $0, label: $0.label) }
}

/// Signed at the end of the report, after the customer reads it: the visit's sign-off. Work
/// authorization comes before the work, so it stays a signature of its own.
public func reportSignOffPurposes(_ settings: JSONValue?) -> [SignaturePurposeOption] {
    enabledSignaturePurposes(settings).filter { $0.value != .workAuthorization }
}

/// media/{company_id}/{job_id}/signature-{id}.svg (immutable, like photos).
public func signatureStoragePath(_ companyId: String, _ jobId: String, _ signatureId: String) -> String {
    "\(companyId)/\(jobId)/signature-\(signatureId).svg"
}

/// Total drawn length in pixels; too little ink is a tap, not a signature.
public func inkLength(_ strokes: [SignatureStroke]) -> Double {
    var total = 0.0
    for s in strokes where s.count > 1 {
        for i in 1..<s.count {
            total += hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y)
        }
    }
    return total
}

public let minInk = 40.0

/// SVG path data for one stroke (a dot when it has a single point).
public func strokePath(_ stroke: SignatureStroke) -> String {
    func r(_ n: Double) -> String { ECMA.numberString(ECMA.round(n * 10) / 10) }
    guard let first = stroke.first else { return "" }
    let start = "M\(r(first.x)) \(r(first.y))"
    if stroke.count == 1 { return start + "l0.1 0" }
    return start + stroke.dropFirst().map { "L\(r($0.x)) \(r($0.y))" }.joined()
}

/// Thrown by `signatureSvg` when there is no ink.
public struct NothingDrawn: Error, CustomStringConvertible {
    public var description: String { "Nothing was drawn." }
}

/// The signature as a standalone SVG, cropped to the ink with a small margin. Dark ink on a
/// transparent background, the way it would look signed on paper.
public func signatureSvg(_ strokes: [SignatureStroke], _ strokeWidth: Double = 3) throws -> String {
    let points = strokes.flatMap { $0 }
    guard !points.isEmpty else { throw NothingDrawn() }
    let pad = strokeWidth * 2
    let xs = points.map(\.x)
    let ys = points.map(\.y)
    let minX = xs.min()! - pad
    let minY = ys.min()! - pad
    let w = xs.max()! + pad - minX
    let h = ys.max()! + pad - minY
    let view = [minX, minY, w, h].map { ECMA.numberString(ECMA.round($0 * 10) / 10) }.joined(separator: " ")
    let paths = strokes.filter { !$0.isEmpty }.map { "<path d=\"\(strokePath($0))\"/>" }.joined()
    return
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"\(view)\" width=\"\(ECMA.numberString(ECMA.round(w)))\" height=\"\(ECMA.numberString(ECMA.round(h)))\">"
        + "<g fill=\"none\" stroke=\"#111111\" stroke-width=\"\(ECMA.numberString(strokeWidth))\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\(paths)</g></svg>"
}

/// What the customer is agreeing to, shown above the box they sign in.
public func signatureStatement(_ purpose: SignaturePurpose, _ shop: String, _ address: String?) -> String {
    let at = address.map { $0.isEmpty ? "" : " at \($0)" } ?? ""
    switch purpose {
    case .inspectionAck: return "I confirm \(shop) inspected the pool\(at) today and explained what they found."
    case .workAuthorization: return "I authorize \(shop) to do the work we agreed on\(at)."
    case .quoteAcceptance: return "I accept \(shop)’s quote for the work\(at)."
    case .completion: return "I confirm \(shop) finished the work\(at) today."
    }
}
