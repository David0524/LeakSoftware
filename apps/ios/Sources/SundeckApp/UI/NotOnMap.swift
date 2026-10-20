#if os(iOS)
    import SundeckCore
    import SwiftUI

    // A pool whose address wasn't found on the map (owner, 2026-10-20: "we need an indicator for
    // when address doesn't register"). Website components/not-on-map.tsx.

    /// The warning row in a job's Pool group: "Not found on the map" and what to do about it.
    struct NotOnMapRow: View {
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
                    Text(NotOnMap.detail).textRole(.secondary).foregroundStyle(Color.textMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, CGFloat(Spacing.rowVertical))
            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
    }

    /// The short form under a stop's or a pool's address: a warning icon and "Not on map".
    struct NotOnMapTag: View {
        var body: some View {
            Label {
                Text(NotOnMap.short)
            } icon: {
                Image(systemName: "exclamationmark.triangle")
            }
            .labelStyle(TagLabelStyle())
            .font(.role(.footnote).weight(.semibold))
            .foregroundStyle(Color.warning)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(NotOnMap.title)
        }

        private struct TagLabelStyle: LabelStyle {
            func makeBody(configuration: Configuration) -> some View {
                HStack(spacing: 4) {
                    configuration.icon
                    configuration.title
                }
            }
        }
    }
#endif
