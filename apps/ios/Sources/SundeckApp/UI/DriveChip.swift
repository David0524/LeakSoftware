#if os(iOS)
    import SwiftUI

    /// The drive to a stop as a small gray pill: a car and the minutes, "🚗 23" (owner,
    /// 2026-10-21: "I like the chip"; docs/design/2026-10-21-schedule-tile.md). Shared by the
    /// Schedule's tiles and Today's. VoiceOver: "23 minute drive".
    struct DriveChip: View {
        var minutes: Int

        var body: some View {
            HStack(spacing: 3) {
                Image(systemName: "car.fill").imageScale(.small)
                Text(verbatim: "\(minutes)").monospacedDigit()
            }
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Color.textMuted)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(Color.fill))
            .lineLimit(1)
            .fixedSize()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(StopDrive.spoken(minutes))
        }
    }
#endif
