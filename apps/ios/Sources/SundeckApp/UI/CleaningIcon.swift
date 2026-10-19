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

    /// "Regular cleanings" under the Chemical button on a visit's checklist: each of the plan's
    /// cleanings with its icon, "On this visit’s checklist" or "Every 3 months · next Mon, Nov
    /// 30" (and a replace filter's age), and "Today" or the countdown (website job page
    /// `Cleanings`). Hidden when there are none.
    struct VisitCleaningsBox: View {
        var cleanings: [RegularCleaning]

        var body: some View {
            if !cleanings.isEmpty {
                Grouped(label: CleaningText.title) {
                    ForEach(cleanings) { c in
                        ListRow(c.name, detail: c.detail) {
                            Text(c.value)
                                .font(.role(.body).weight(c.soon ? .semibold : .regular))
                                .foregroundStyle(c.soon ? Color.warning : Color.textMuted)
                        }
                        .withLeading(CleaningIcon(kind: c.kind))
                    }
                }
            }
        }
    }

    /// A cleaning on a Today card: just its icon and how soon ("Today", "3 days"), muted, in
    /// the fail color when overdue, no fill (owner, 2026-10-19: "Don't make it too wordy");
    /// VoiceOver reads it with the cleaning's name ("Clean filter due today").
    struct CleaningDueLabel: View {
        var cleaning: VisitCleaning

        var body: some View {
            HStack(spacing: 6) {
                CleaningIcon(kind: cleaning.kind, size: 18)
                Text(CleaningText.short(cleaning)).font(.role(.secondary).weight(.medium))
            }
            .foregroundStyle(CleaningText.isOverdue(cleaning) ? Color.fail : Color.textMuted)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(CleaningText.spoken(cleaning))
        }
    }
#endif
