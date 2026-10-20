#if os(iOS)
    import SundeckCore
    import SundeckLiveStop
    import SwiftUI

    /// A scheduled cleaning's icon, drawn from the website's (icons.tsx): 1.8 stroke in a
    /// 24-unit box, round caps and joins, in the current foreground color.
    struct CleaningIcon: View {
        var kind: CleaningKind
        var size: CGFloat = 20

        var body: some View { CleaningGlyphIcon(kind: kind, size: size) }
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
