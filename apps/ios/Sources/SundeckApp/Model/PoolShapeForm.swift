import Foundation
import SundeckCore
import SundeckSync

// Edit Pool Shape (owner, 2026-10-19: "More customization to pool shape. Be able to place the
// spa wherever"): the shape, mirrored or not, whether there's a spa, and where the spa sits,
// how big, and round or square. Port of ShapeForm in apps/web/src/components/diagram-work.tsx
// and savePoolDiagram in app/actions/diagram.ts.

/// The Pool Shape sheet's state.
public struct PoolShapeForm: Equatable, Sendable {
    public var shape: DiagramShape?
    public var hasSpa: Bool
    public var mirror: Bool
    /// Where the tech put the spa (its center, 0..1 of the drawing); nil leaves it in the corner.
    public var spaAt: MarkupPoint?
    public var size: SpaSize
    public var spaShape: SpaShape

    /// How far one VoiceOver move (the website's arrow key) moves the spa: 2% of the drawing.
    public static let step = 0.02

    public static let title = "Pool Shape"
    public static let mirrorLabel = "Mirror (flip left to right)"
    public static let spaLabel = "Has a spa"
    public static let placeLabel = "Where the spa is"
    public static let placeHint = "Tap the drawing to move the spa anywhere."
    public static let resetSpa = "Put the Spa Back in the Corner"
    public static let sizeLabel = "Spa size"
    public static let shapeLabel = "Spa shape"
    public static let save = "Save Pool Shape"

    /// The form for a property as it is now.
    public init(property: Row?) {
        shape = diagramShape(of: property)
        hasSpa = property?["has_spa"]?.bool ?? false
        let layout = diagramLayout(of: property)
        mirror = layout.mirror == true
        spaAt = layout.spa.map { MarkupPoint(x: $0.x, y: $0.y) }
        size = layout.spa?.size ?? .medium
        spaShape = layout.spa?.shape ?? .round
    }

    /// Where the spa is drawn now: the placed spot, else the corner (top right, or top left
    /// when mirrored). nil without a spa.
    public var at: MarkupPoint? {
        if let spaAt { return spaAt }
        let corner = poolDiagram(shape, hasSpa, DiagramLayout(mirror: mirror ? true : nil)).spa
        return corner.map { MarkupPoint(x: $0.cx / 160, y: $0.cy / 100) }
    }

    /// The layout Save writes. A size or shape alone keeps the spa where it is drawn now; the
    /// default medium round spa in the corner writes no spa, so it stays the old drawing.
    public var layout: DiagramLayout {
        var next = DiagramLayout(mirror: mirror ? true : nil)
        if hasSpa, let at, spaAt != nil || size != .medium || spaShape != .round {
            next.spa = .init(x: at.x, y: at.y, size: size, shape: spaShape)
        }
        return next
    }

    /// The drawing with this form's choices.
    public var diagram: SundeckCore.PoolDiagram { poolDiagram(shape, hasSpa, layout) }

    /// A tap on the drawing (fractions of it): the spa moves there, kept inside the drawing.
    public mutating func place(x: Double, y: Double) {
        guard hasSpa else { return }
        spaAt = MarkupPoint(x: diagramUnit(x), y: diagramUnit(y))
    }

    /// Moves the spa by a step (VoiceOver's actions, as the website's arrow keys).
    public mutating func nudge(dx: Double, dy: Double) {
        guard hasSpa, let at else { return }
        spaAt = MarkupPoint(x: diagramUnit(at.x + dx), y: diagramUnit(at.y + dy))
    }

    /// Put the Spa Back in the Corner.
    public mutating func resetSpa() { spaAt = nil }

    /// "Spa 85% across, 20% down": the spa's place for VoiceOver.
    public var placeValue: String {
        guard let at else { return "" }
        return "Spa \(Int((at.x * 100).rounded()))% across, \(Int((at.y * 100).rounded()))% down"
    }

    /// `property.diagram_layout` as the website writes it: `{"mirror": true, "spa": {"x", "y",
    /// "size", "shape"}}`, or null when it's the plain drawing.
    public var layoutJSON: JSONValue {
        let l = layout
        var object: [String: JSONValue] = [:]
        if l.mirror == true { object["mirror"] = .bool(true) }
        if let spa = l.spa {
            object["spa"] = .object([
                "x": .number(spa.x), "y": .number(spa.y), "size": .string((spa.size ?? .medium).rawValue),
                "shape": .string((spa.shape ?? .round).rawValue),
            ])
        }
        return object.isEmpty ? .null : .object(object)
    }
}

/// 0..1, to 4 places (the website's `round`).
func diagramUnit(_ v: Double) -> Double {
    guard v.isFinite else { return 0 }
    return (min(1, max(0, v)) * 10_000).rounded() / 10_000
}

@MainActor
extension InspectionWrites {
    /// Save Pool Shape: the shape (nil: not known yet), the spa, and the layout, in one write
    /// through the sync layer.
    public static func savePoolShape(_ sync: SyncService, propertyId: String, companyId: String, _ form: PoolShapeForm)
        throws
    {
        try sync.write(
            "property", id: propertyId, companyId: companyId,
            [
                "diagram_shape": form.shape.map { .string($0.rawValue) } ?? .null, "has_spa": .bool(form.hasSpa),
                "diagram_layout": form.layoutJSON,
            ])
    }
}

// MARK: - Markup on the pool diagram (owner, 2026-10-19: "Add markup tools to the pool diagrams")

/// What's drawn on the job's pool diagram (`job.diagram_markup`, the same format as a photo's
/// markup, 0..1 of the diagram).
public func jobDiagramMarkup(_ job: Row?) -> [MarkupShape] { parseMarkup(job?["diagram_markup"]).shapes }

/// "Mark Up", or "Edit Markup" once something is drawn (website DiagramPanel).
public func diagramMarkupButton(_ shapes: [MarkupShape]) -> String { shapes.isEmpty ? "Mark Up" : "Edit Markup" }

@MainActor
extension InspectionWrites {
    /// Saves the diagram's markup on the job through the sync layer; nothing drawn clears it.
    public static func setDiagramMarkup(_ sync: SyncService, jobId: String, companyId: String, _ markup: Markup?)
        throws
    {
        let value: JSONValue = try markup.flatMap { $0.shapes.isEmpty ? nil : try json($0) } ?? .null
        try sync.write("job", id: jobId, companyId: companyId, ["diagram_markup": value])
    }
}
