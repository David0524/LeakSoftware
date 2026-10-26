import Foundation
import SundeckCore
import SundeckSync

// Edit Pool Shape (owner, 2026-10-19): ten tiles (the seven preset shapes, Draw, Clear and
// Landmarks), Mirror and Has a spa, and the drawing itself, where the spa is moved, reshaped
// (tap) and resized (pinch, or its corner handle), shapes are drawn and landmarks placed. Port
// of apps/web/src/components/pool-shape-editor.tsx and savePoolDiagram in app/actions/diagram.ts.

/// The Pool Shape sheet's tiles, two rows of five, the three creative ones in the middle of the
/// second (owner, 2026-10-19).
public enum PoolShapeTile: Hashable, Sendable {
    case shape(DiagramShape)
    case draw, clear, landmarks

    public static let all: [PoolShapeTile] =
        [.rectangle, .oval, .kidney, .lShape, .roman, .grecian].map(PoolShapeTile.shape)
        + [.draw, .clear, .landmarks, .shape(.figureEight)]

    public var label: String {
        switch self {
        case .shape(let s): s.label
        case .draw: "Draw"
        case .clear: "Clear"
        case .landmarks: "Landmarks"
        }
    }
}

/// The spa as placed on the drawing: its center (0..1), radius in diagram units, and shape.
public struct PlacedSpa: Equatable, Sendable {
    public var x: Double
    public var y: Double
    public var r: Double
    public var shape: SpaShape

    public init(x: Double, y: Double, r: Double, shape: SpaShape) {
        self.x = x
        self.y = y
        self.r = r
        self.shape = shape
    }
}

/// The Pool Shape sheet's state: what Save writes.
public struct PoolShapeForm: Equatable, Sendable {
    public var shape: DiagramShape?
    public var hasSpa: Bool
    public var mirror: Bool
    /// Where the tech put the spa, and its size and shape; nil leaves it in the corner.
    public var spa: PlacedSpa?
    public var drawing: [DrawnShape]
    public var landmarks: [Landmark]

    /// How far one VoiceOver move (the website's arrow key) moves the spa: 2% of the drawing.
    public static let step = 0.02

    public static let title = "Pool Shape"
    public static let tilesLabel = "Pool shape"
    public static let mirrorLabel = "Mirror (flip left to right)"
    public static let spaLabel = "Has a spa"
    public static let spaHint =
        "Tap the spa to make it round or square. Drag it to move it; pinch or drag its corner to resize."
    public static let noSpaHint = "Turn on Has a spa to put a spa on the drawing."
    public static let drawHint = "Drag on the drawing. Draw on a shape, or Clear and start from nothing."
    public static let landmarksHint =
        "Pick one, then tap the drawing. Tap a landmark to select it: tap again to turn or flip it, pinch or drag its corner to resize, or tap its X to delete it."
    public static let undo = "Undo"
    public static let clearTitle = "Clear the pool diagram?"
    public static let clearMessage = "The shape, spa, drawing, and landmarks are removed. Pins and markup stay."
    public static let clearButton = "Clear Diagram"
    public static let save = "Save Pool Shape"

    /// "Tap the drawing to put the tree there."
    public static func placingHint(_ kind: LandmarkKind) -> String {
        "Tap the drawing to put the \(kind.label.lowercased()) there."
    }

    /// VoiceOver's name for a selected landmark's delete action: "Delete Tree".
    public static func deleteTitle(_ kind: LandmarkKind) -> String { "Delete \(kind.label)" }

    /// The form for a property as it is now, opened on the centered pool with what's placed on
    /// it moved along (owner, 2026-10-20; core `centerLayout`).
    public init(property: Row?) {
        shape = diagramShape(of: property)
        hasSpa = property?["has_spa"]?.bool ?? false
        let layout = centerLayout(diagramLayout(of: property))
        mirror = layout.mirror == true
        spa = layout.spa.map {
            PlacedSpa(
                x: $0.x, y: $0.y, r: poolDiagram(diagramShape(of: property), true, layout).spa?.r ?? SpaSize.medium.r,
                shape: $0.shape ?? .round)
        }
        drawing = layout.drawing ?? []
        landmarks = layout.landmarks ?? []
    }

    /// Where the spa is drawn now: placed, or the corner (top right, or top left mirrored). Nil
    /// without a spa.
    public var spaNow: PlacedSpa? {
        guard hasSpa else { return nil }
        if let spa { return spa }
        return poolDiagram(shape, true, DiagramLayout(mirror: mirror ? true : nil, centered: true)).spa.map {
            PlacedSpa(x: $0.cx / 160, y: $0.cy / 100, r: $0.r, shape: .round)
        }
    }

    /// The layout Save writes (the website's `next`): always centered, and the spa only once it
    /// was moved, reshaped or resized, so an untouched one stays the corner drawing.
    public var layout: DiagramLayout {
        DiagramLayout(
            mirror: mirror ? true : nil, centered: true,
            spa: hasSpa
                ? spa.map { .init(x: $0.x, y: $0.y, size: spaSizeFor($0.r), shape: $0.shape, r: $0.r) } : nil,
            drawing: drawing.isEmpty ? nil : drawing, landmarks: landmarks.isEmpty ? nil : landmarks)
    }

    /// The drawing with this form's choices.
    public var diagram: SundeckCore.PoolDiagram { poolDiagram(shape, hasSpa, layout) }

    // MARK: - Tiles

    /// A shape tile: picks it, or clears it when it's the one picked.
    public mutating func tapShape(_ tapped: DiagramShape) { shape = shape == tapped ? nil : tapped }

    /// Clear: no outline, no spa, nothing drawn, no landmarks (`CLEARED_DIAGRAM`).
    public mutating func clear() {
        shape = clearedDiagram.shape
        hasSpa = clearedDiagram.hasSpa
        mirror = false
        spa = nil
        drawing = []
        landmarks = []
    }

    // MARK: - The drawing (points are 0..1 of it)

    /// On the spa (within its radius and 2 units).
    public func onSpa(x: Double, y: Double) -> Bool {
        guard let s = spaNow else { return false }
        return hypot((x - s.x) * 160, (y - s.y) * 100) <= s.r + 2
    }

    /// On the spa's corner handle, at its lower right.
    public func onHandle(x: Double, y: Double) -> Bool {
        guard let s = spaNow else { return false }
        return hypot((x - s.x) * 160 - s.r * 0.71, (y - s.y) * 100 - s.r * 0.71) <= 6
    }

    /// The landmark under a point, if any: the top one (drawn last).
    public func landmarkAt(x: Double, y: Double) -> Int? {
        diagram.landmarks.lastIndex {
            abs(x * 160 - $0.cx) <= $0.size / 2 + 2 && abs(y * 100 - $0.cy) <= $0.size / 2 + 2
        }
    }

    /// A selected landmark's corners as drawn: the X (delete) at its top right, the resize
    /// handle at its bottom right.
    private func near(_ x: Double, _ y: Double, _ px: Double, _ py: Double) -> Bool {
        hypot(x * 160 - px, y * 100 - py) <= 6
    }

    public func onLandmarkDelete(_ index: Int, x: Double, y: Double) -> Bool {
        guard diagram.landmarks.indices.contains(index) else { return false }
        let l = diagram.landmarks[index]
        return near(x, y, l.cx + l.size / 2, l.cy - l.size / 2)
    }

    public func onLandmarkHandle(_ index: Int, x: Double, y: Double) -> Bool {
        guard diagram.landmarks.indices.contains(index) else { return false }
        let l = diagram.landmarks[index]
        return near(x, y, l.cx + l.size / 2, l.cy + l.size / 2)
    }

    /// A landmark's size as drawn (its own, else `landmarkSize`).
    public func landmarkSizeAt(_ index: Int) -> Double? {
        landmarks.indices.contains(index) ? landmarks[index].s ?? landmarkSize : nil
    }

    /// Resizes a landmark, kept within what can be pinched (`clampLandmarkSize`).
    public mutating func setLandmarkSize(_ index: Int, _ size: Double) {
        guard landmarks.indices.contains(index), size.isFinite else { return }
        landmarks[index].s = clampLandmarkSize(size)
    }

    /// Its corner handle dragged to a point: the size reaches it from the center.
    public mutating func resizeLandmark(_ index: Int, toX x: Double, y: Double) {
        guard diagram.landmarks.indices.contains(index) else { return }
        let l = diagram.landmarks[index]
        setLandmarkSize(index, 2 * max(abs(x * 160 - l.cx), abs(y * 100 - l.cy)))
    }

    /// A tap on the selected landmark mirrors it.
    public mutating func flipLandmark(_ index: Int) {
        guard landmarks.indices.contains(index) else { return }
        // The steps, waterfall, skimmer, return, and suction line turn a quarter; the others mirror
        // (core tapLandmark).
        landmarks[index] = tapLandmark(landmarks[index])
    }

    /// Tapping the spa switches it round and square.
    public mutating func toggleSpaShape() {
        guard var s = spaNow else { return }
        s.shape = s.shape == .square ? .round : .square
        spa = s
    }

    /// Drags the spa to a point.
    public mutating func moveSpa(x: Double, y: Double) {
        guard var s = spaNow else { return }
        s.x = diagramUnit(x)
        s.y = diagramUnit(y)
        spa = s
    }

    /// Moves the spa by a step (VoiceOver's actions, as the website's arrow keys).
    public mutating func nudge(dx: Double, dy: Double) {
        guard let s = spaNow else { return }
        moveSpa(x: s.x + dx, y: s.y + dy)
    }

    /// Sets the spa's radius, kept within what can be pinched (`clampSpaR`).
    public mutating func setSpaR(_ r: Double) {
        guard var s = spaNow, r.isFinite else { return }
        s.r = clampSpaR(r)
        spa = s
    }

    /// The corner handle dragged to a point: the radius is the distance from the center.
    public mutating func resizeSpa(toX x: Double, y: Double) {
        guard let s = spaNow else { return }
        setSpaR(hypot((x - s.x) * 160, (y - s.y) * 100))
    }

    /// Puts a landmark where the drawing was tapped (at most `landmarksMax`).
    public mutating func placeLandmark(_ kind: LandmarkKind, x: Double, y: Double) {
        guard landmarks.count < landmarksMax else { return }
        landmarks.append(Landmark(kind: kind, x: diagramUnit(x), y: diagramUnit(y)))
    }

    public mutating func moveLandmark(_ index: Int, x: Double, y: Double) {
        guard landmarks.indices.contains(index) else { return }
        landmarks[index].x = diagramUnit(x)
        landmarks[index].y = diagramUnit(y)
    }

    public mutating func removeLandmark(_ index: Int) {
        guard landmarks.indices.contains(index) else { return }
        landmarks.remove(at: index)
    }

    /// A drag with Draw (`drawnShapeFrom`), added when it's big enough to see (at most
    /// `drawingMax`).
    public mutating func draw(_ tool: DrawTool, _ points: [(x: Double, y: Double)]) {
        guard drawing.count < drawingMax, let made = drawnShapeFrom(tool, points) else { return }
        drawing.append(made)
    }

    /// Undo: the last drawn shape comes off.
    public mutating func undo() {
        if !drawing.isEmpty { drawing.removeLast() }
    }

    /// "Pool drawing, Spa, round, size 13, 2 landmarks, 3 drawn": the drawing for VoiceOver.
    public var drawingLabel: String {
        [
            "Pool drawing",
            spaNow.map { "Spa, \($0.shape == .square ? "square" : "round"), size \(Int(($0.r + 0.5).rounded(.down)))" },
            landmarks.isEmpty ? nil : "\(landmarks.count) landmarks",
            drawing.isEmpty ? nil : "\(drawing.count) drawn",
        ]
        .compactMap { $0 }.joined(separator: ", ")
    }

    /// `property.diagram_layout` as the website writes it (`parseDiagramLayout` of `next`):
    /// always centered (owner, 2026-10-20).
    public var layoutJSON: JSONValue {
        let l = layout
        var object: [String: JSONValue] = [:]
        if l.centered == true { object["centered"] = .bool(true) }
        if l.mirror == true { object["mirror"] = .bool(true) }
        if let spa = l.spa {
            object["spa"] = .object([
                "x": .number(spa.x), "y": .number(spa.y), "size": .string((spa.size ?? .medium).rawValue),
                "shape": .string((spa.shape ?? .round).rawValue), "r": spa.r.map(JSONValue.number) ?? .null,
            ])
        }
        if let drawing = l.drawing { object["drawing"] = .array(drawing.map(\.json)) }
        if let landmarks = l.landmarks {
            object["landmarks"] = .array(
                landmarks.map { l in
                    var o: [String: JSONValue] = [
                        "kind": .string(l.kind.rawValue), "x": .number(l.x), "y": .number(l.y),
                    ]
                    if let size = l.s { o["s"] = .number(size) }
                    if l.flip == true { o["flip"] = .bool(true) }
                    if let turn = l.turn { o["turn"] = .number(Double(turn)) }
                    return .object(o)
                })
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
