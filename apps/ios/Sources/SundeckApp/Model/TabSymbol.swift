import Foundation

/// A tab's symbol as the website draws it (`ICONS` in apps/web/src/components/nav-links.tsx), on
/// a 24 x 24 artboard with 1.8 round strokes. Selected tabs show the filled version: `shape`
/// filled and stroked, `cut` stroked out of it, then `extra` stroked on top.
public struct TabSymbol: Sendable, Equatable {
    /// Outline strokes: the path and its stroke width.
    public var line: [(d: String, width: Double)]
    public var shape: String
    public var cut: String?
    public var cutWidth: Double = 2
    public var extra: String?

    public static func == (a: TabSymbol, b: TabSymbol) -> Bool {
        a.line.map(\.d) == b.line.map(\.d) && a.line.map(\.width) == b.line.map(\.width) && a.shape == b.shape
            && a.cut == b.cut && a.cutWidth == b.cutWidth && a.extra == b.extra
    }

    public static let stroke: Double = 1.8

    public static let today = TabSymbol(
        line: [
            (
                "M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
                stroke
            )
        ],
        shape: "M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z",
        cut: "M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z")

    public static let jobs = TabSymbol(
        line: [
            ("M9 4h6M8 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2M9 11h6M9 15h4", stroke)
        ],
        shape: "M6 4h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z",
        cut: "M9 11h6M9 15h4")

    public static let schedule = TabSymbol(
        line: [
            (
                "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 12h3M8 16h3M13 12h3",
                stroke
            )
        ],
        shape: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
        cut: "M4 8.5h16M8 12h3M8 16h3M13 12h3",
        extra: "M7 3v3M17 3v3")

    public static let messages = TabSymbol(
        line: [("M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z", stroke)],
        shape: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z",
        cut: "M8 11h.01M12 11h.01M16 11h.01",
        cutWidth: 2.6)

    public static let more = TabSymbol(
        line: [("M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z", stroke), ("M8 12h.01M12 12h.01M16 12h.01", 2.6)],
        shape: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z",
        cut: "M8 12h.01M12 12h.01M16 12h.01",
        cutWidth: 2.8)
}
