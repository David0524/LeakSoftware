#if os(iOS)
    import SwiftUI

    // Skeleton screens (owner, 2026-10-22: "Skeleton screens, not spinners"): gray shapes where
    // the content will be, laid out as it will be, so nothing jumps when it arrives. A soft
    // highlight sweeps across them every 1.6 s; Reduce Motion keeps the shapes and drops the
    // sweep. The same look as the website (globals.css › .shimmer) and the Android app
    // (ui/Skeleton.tsx). Spinners stay only inside buttons doing something and on the first
    // download. docs/design/2026-10-22-instant-and-skeletons.md.

    /// The sweeping highlight, drawn over the view and clipped to its shape.
    struct Shimmer: ViewModifier {
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        @Environment(\.colorScheme) private var scheme
        @State private var phase: CGFloat = -1

        func body(content: Content) -> some View {
            content
                .overlay {
                    if !reduceMotion {
                        GeometryReader { geo in
                            LinearGradient(
                                stops: [
                                    .init(color: .white.opacity(0), location: 0.2),
                                    .init(color: .white.opacity(scheme == .dark ? 0.08 : 0.6), location: 0.5),
                                    .init(color: .white.opacity(0), location: 0.8),
                                ],
                                startPoint: .leading, endPoint: .trailing
                            )
                            .frame(width: geo.size.width)
                            .offset(x: phase * geo.size.width)
                        }
                        .mask(content)
                        .allowsHitTesting(false)
                        .onAppear {
                            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: false)) {
                                phase = 1
                            }
                        }
                    }
                }
        }
    }

    extension View {
        /// The skeleton's sweeping highlight (none with Reduce Motion).
        func shimmer() -> some View { modifier(Shimmer()) }
    }

    /// A placeholder shape: a pill unless given a corner radius.
    struct Bone: View {
        var width: CGFloat?
        var height: CGFloat = 14
        var radius: CGFloat?

        var body: some View {
            RoundedRectangle(cornerRadius: radius ?? height / 2, style: .continuous)
                .fill(Color.fill)
                .frame(width: width, height: height)
                .shimmer()
                .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
        }
    }

    /// Widths that vary row to row, as real names do (the same on the website and Android).
    private let firstLine: [CGFloat] = [0.4, 0.5, 0.33, 0.6, 0.4, 0.5]

    /// A grouped list's rows while they load (Activity, a job's schedule, settings).
    struct SkeletonRows: View {
        var count = 5
        /// Rows start with an unread dot (Activity).
        var dot = false
        var label = "Loading"

        var body: some View {
            VStack(spacing: 0) {
                ForEach(0..<count, id: \.self) { i in
                    HStack(spacing: 12) {
                        if dot { Bone(width: 10, height: 10) }
                        GeometryReader { geo in
                            VStack(alignment: .leading, spacing: 8) {
                                Bone(width: geo.size.width * firstLine[i % firstLine.count], height: 16)
                                Bone(width: geo.size.width * (i % 2 == 1 ? 0.75 : 0.66))
                            }
                        }
                        .frame(height: 38)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 11)
                    .overlay(alignment: .top) {
                        if i > 0 { Rectangle().fill(Color.separator).frame(height: 0.5).padding(.leading, 16) }
                    }
                }
            }
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
        }
    }

    /// Lines of text still on their way (a job's Timeline).
    struct SkeletonLines: View {
        var count = 3
        var label = "Loading"

        var body: some View {
            GeometryReader { geo in
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(0..<count, id: \.self) { i in
                        Bone(width: geo.size.width * (i % 2 == 1 ? 0.7 : 0.9))
                    }
                }
            }
            .frame(height: CGFloat(count) * 26)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
        }
    }

    /// A section's card while it loads (the report, a quote, the invoice, New Job).
    struct SkeletonCard: View {
        var label = "Loading"

        var body: some View {
            VStack(alignment: .leading, spacing: 10) {
                Bone(width: 180, height: 18)
                Bone()
                Bone(width: 220)
                Bone(width: 140, height: 44)
                    .padding(.top, 6)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
        }
    }

    /// The Dashboard: four stat cards two by two, then the chart's card.
    struct SkeletonDashboard: View {
        var body: some View {
            VStack(spacing: 12) {
                Grid(horizontalSpacing: 12, verticalSpacing: 12) {
                    GridRow {
                        tile
                        tile
                    }
                    GridRow {
                        tile
                        tile
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    Bone(width: 160, height: 18)
                    Bone(width: 240)
                    HStack(alignment: .bottom) {
                        ForEach([0.45, 0.6, 0.4, 0.75, 0.55, 0.9], id: \.self) { h in
                            Bone(width: 24, height: 120 * h, radius: 6)
                            if h != 0.9 { Spacer(minLength: 0) }
                        }
                    }
                    .frame(height: 120, alignment: .bottom)
                    .padding(.top, 8)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card()
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Loading the dashboard")
        }

        private var tile: some View {
            VStack(alignment: .leading, spacing: 8) {
                Bone(width: 90)
                Bone(width: 110, height: 28, radius: 8)
                Bone(width: 70, height: 12)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
        }
    }
#endif
