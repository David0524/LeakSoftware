#if os(iOS)
    import SundeckCore
    import SwiftUI

    /// The day's progress ring on Today's summary line (owner, 2026-10-22, goal-gradient; docs/
    /// design/2026-10-22-progress-cues.md), as on the website: 28 points, the primary blue on a
    /// gray track; with every stop done, a filled green circle with a check. The words beside it
    /// carry the count, so VoiceOver skips the ring.
    struct DayRing: View {
        var progress: DayProgress
        var size: CGFloat = 28

        var body: some View {
            ZStack {
                if progress.state == .allDone {
                    Circle().fill(Color.pass)
                    Image(systemName: "checkmark")
                        .font(.system(size: size * 0.45, weight: .bold))
                        .foregroundStyle(.white)
                } else {
                    Circle().stroke(Color.fill, lineWidth: 4).padding(2)
                    Circle()
                        .trim(from: 0, to: progress.fraction)
                        .stroke(Color.brandPrimary, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .padding(2)
                }
            }
            .frame(width: size, height: size)
            .animation(.smooth, value: progress.fraction)
            .accessibilityHidden(true)
        }
    }

    /// Mark Complete once it's the last thing (owner, 2026-10-22): a one-time scale-in with a small
    /// overshoot when `on` turns true, as on the website; none with Reduce Motion.
    struct ReadyPop: ViewModifier {
        var on: Bool
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        @State private var scale: CGFloat = 1

        func body(content: Content) -> some View {
            content
                .scaleEffect(scale)
                .onChange(of: on, initial: true) { _, now in
                    guard now, !reduceMotion else { return }
                    scale = 0.94
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) { scale = 1 }
                }
        }
    }

    extension View {
        /// `ReadyPop`: scales in once when `on` turns true.
        func readyPop(_ on: Bool) -> some View { modifier(ReadyPop(on: on)) }
    }
#endif
