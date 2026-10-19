#if os(iOS)
    import SundeckCore
    import SwiftUI

    /// A scheduled cleaning's icon, drawn from the website's (icons.tsx): 1.8 stroke in a
    /// 24-unit box, round caps and joins, in the current foreground color.
    struct CleaningIcon: View {
        var kind: CleaningKind
        var size: CGFloat = 20

        var body: some View {
            CleaningGlyphShape(glyph: .of(kind))
                .stroke(style: StrokeStyle(lineWidth: 1.8 * size / 24, lineCap: .round, lineJoin: .round))
                .frame(width: size, height: size)
                .accessibilityHidden(true)
        }
    }

    private struct CleaningGlyphShape: Shape {
        var glyph: CleaningGlyph

        func path(in rect: CGRect) -> Path {
            let k = min(rect.width, rect.height) / 24
            var path = Path()
            for r in glyph.rects where r.count == 5 {
                path.addRoundedRect(
                    in: CGRect(x: rect.minX + r[0] * k, y: rect.minY + r[1] * k, width: r[2] * k, height: r[3] * k),
                    cornerSize: CGSize(width: r[4] * k, height: r[4] * k), style: .circular)
            }
            let transform = CGAffineTransform(translationX: rect.minX, y: rect.minY).scaledBy(x: k, y: k)
            for d in glyph.paths { path.addPath(Path(cgPath(svg: d)), transform: transform) }
            return path
        }
    }

    /// "Regular cleanings" under the Chemical button on a visit's checklist: each cleaning on
    /// this visit's checklist, with its icon, "On this visit’s checklist" and "Today" (website
    /// job page `Cleanings`). Hidden when there are none.
    struct VisitCleaningsBox: View {
        var cleanings: [VisitCleaning]

        var body: some View {
            if !cleanings.isEmpty {
                Grouped(label: CleaningText.title) {
                    ForEach(cleanings) { c in
                        ListRow(c.name, detail: CleaningText.onVisit) {
                            Text(CleaningText.today)
                                .font(.role(.body).weight(c.due.soon ? .semibold : .regular))
                                .foregroundStyle(c.due.soon ? Color.warning : Color.textMuted)
                        }
                        .withLeading(CleaningIcon(kind: c.kind))
                    }
                }
            }
        }
    }

    /// The Today card's pill: "Clean filter: due today", warning-tinted, with the icon.
    struct CleaningPill: View {
        var cleaning: VisitCleaning

        var body: some View {
            HStack(spacing: 6) {
                CleaningIcon(kind: cleaning.kind, size: 16)
                Text(CleaningText.pill(cleaning)).font(.role(.secondary).weight(.semibold))
            }
            .foregroundStyle(Color.text)
            .padding(.horizontal, 12)
            .frame(minHeight: 32)
            .background(Capsule().fill(Color.warning.opacity(0.1)))
            .accessibilityElement(children: .combine)
        }
    }
#endif
