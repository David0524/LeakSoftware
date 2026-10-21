#if os(iOS)
    import SundeckCore
    import SwiftUI

    // A pool whose address wasn't found on the map (owner, 2026-10-20: "we need an indicator for
    // when address doesn't register"). Website components/not-on-map.tsx.

    /// The warning row in a job's Pool group: "Not found on the map" and what to do about it.
    struct NotOnMapRow: View {
        /// What to do about it (a home address says the day starts at the shop meanwhile).
        var detail = NotOnMap.detail

        var body: some View {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color.warning)
                    .frame(width: 22)
                    .padding(.top, 1)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(NotOnMap.title).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                    Text(detail).textRole(.secondary).foregroundStyle(Color.textMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, CGFloat(Spacing.rowVertical))
            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
    }

    /// The short form, right after a stop's or a pool's address on its line: just the warning
    /// symbol (owner, 2026-10-20: "just put a little error symbol next to the address. Don't
    /// waste space with text"). VoiceOver says "Not found on the map". It takes the font of the
    /// text it follows, so it's about 1em.
    struct NotOnMapTag: View {
        var color: Color = .warning

        var body: some View {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(color)
                .accessibilityLabel(NotOnMap.title)
        }

        /// The symbol as text, to follow an address that wraps: " ⚠".
        static func text(color: Color = .warning) -> Text {
            Text(" ")
                + Text(Image(systemName: "exclamationmark.triangle.fill")).foregroundStyle(color)
                .accessibilityLabel(NotOnMap.title)
        }
    }
#endif
