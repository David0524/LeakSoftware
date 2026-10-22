#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SundeckTokens
    import SwiftUI

    /// The first download, as a pool that fills (owner, 2026-10-20: "Downloading your company
    /// takes a long time. Give a more interesting loading bar."; docs/design/2026-10-20-gestures.md
    /// section 11): a rounded pool outline whose water rises to the real fraction (core
    /// `downloadProgress`, from the server's count and the rows applied), with a slow wave on top;
    /// the percent under it, rolling; then the kinds the shop has, each with a spinner while it
    /// downloads and a check when done. Without a count, the water moves with no percent. Under
    /// Reduce Motion the surface is flat and the level steps.
    struct DownloadProgressView: View {
        var download: PullProgress?
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        static let footer =
            "This may take a while. Thank you for your patience. It happens once; after this, the app works without signal."
        static let title = "Downloading your company"

        var body: some View {
            let p = downloadProgress(download?.pulled ?? [:], download?.totals)
            let finished = download?.finished == true && download?.totals != nil
            VStack(spacing: 20) {
                VStack(spacing: 12) {
                    PoolFill(fraction: finished ? 1 : p.fraction, reduceMotion: reduceMotion)
                        .frame(width: 220, height: 120)
                    Group {
                        if finished {
                            Image(systemName: "checkmark")
                                .font(.system(size: 30, weight: .bold))
                                .foregroundStyle(Color.link)
                                .transition(.scale.combined(with: .opacity))
                        } else if !p.percent.isEmpty {
                            Text(p.percent)
                                .font(.custom(BrandFonts.Weight.extraBold.rawValue, size: 34, relativeTo: .largeTitle))
                                .monospacedDigit()
                                .foregroundStyle(Color.text)
                                .contentTransition(reduceMotion ? .identity : .numericText())
                                .animation(reduceMotion ? nil : .snappy, value: p.percent)
                        }
                    }
                    .frame(minHeight: 40)
                    Text(Self.title).textRole(.body).foregroundStyle(Color.text)
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Self.title)
                .accessibilityValue(finished ? "Done" : p.spoken)
                .accessibilityAddTraits(.updatesFrequently)
                if !p.kinds.isEmpty {
                    Grouped(footer: Self.footer) {
                        ForEach(p.kinds, id: \.key) { kind in
                            KindRow(kind: kind, current: kind.key == p.current?.key)
                        }
                    }
                } else {
                    Text(Self.footer)
                        .textRole(.footnote)
                        .foregroundStyle(Color.textMuted)
                        .multilineTextAlignment(.center)
                }
            }
        }

        /// "Jobs  312 of 1,240", a spinner while it downloads, a check when done.
        private struct KindRow: View {
            var kind: DownloadKind
            var current: Bool

            var body: some View {
                ListRow(kind.label, icon: symbol) {
                    HStack(spacing: 8) {
                        Text(downloadCount(done: kind.done, total: kind.total))
                            .textRole(.secondary)
                            .monospacedDigit()
                            .foregroundStyle(Color.textMuted)
                        Group {
                            if kind.complete {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(Color.link)
                            } else if current {
                                ProgressView().controlSize(.small)
                            } else {
                                Color.clear
                            }
                        }
                        .frame(width: 20)
                        .accessibilityHidden(true)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(
                    kind.complete
                        ? "\(kind.label), done" : "\(kind.label), \(downloadCount(done: kind.done, total: kind.total))")
            }

            private var symbol: String {
                switch kind.key {
                case "customers": "person.2"
                case "pools": "drop"
                case "jobs": "wrench.and.screwdriver"
                case "photos": "photo.on.rectangle"
                case "paperwork": "doc.text"
                case "messages": "message"
                default: "gearshape"
                }
            }
        }
    }

    /// The pool: a rounded outline in `controlBorder`, water in the brand's water blue up to
    /// `fraction` (a gentle bob while the fraction isn't known), a 2 s wave on its surface.
    private struct PoolFill: View {
        var fraction: Double?
        var reduceMotion: Bool

        var body: some View {
            let shape = RoundedRectangle(cornerRadius: 28, style: .continuous)
            TimelineView(.animation(paused: reduceMotion)) { context in
                let t = context.date.timeIntervalSinceReferenceDate
                let phase = reduceMotion ? 0 : (t.truncatingRemainder(dividingBy: 2)) / 2 * 2 * .pi
                // Unknown: the water rises and falls slowly around a third.
                let level = fraction ?? (reduceMotion ? 0.35 : 0.35 + 0.08 * sin(t / 1.5))
                WaterShape(level: level, phase: phase, amplitude: reduceMotion ? 0 : 5)
                    .fill(Color.water)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 0.4), value: fraction)
            }
            .clipShape(shape.inset(by: 3))
            .overlay { shape.strokeBorder(Color.controlBorder, lineWidth: 3) }
        }
    }

    /// Water up to `level` (0...1) with a sine wave on top.
    private struct WaterShape: Shape {
        var level: Double
        var phase: Double
        var amplitude: Double

        var animatableData: Double {
            get { level }
            set { level = newValue }
        }

        func path(in rect: CGRect) -> Path {
            let top = rect.maxY - rect.height * min(1, max(0, level))
            var path = Path()
            path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
            let steps = 40
            for i in 0...steps {
                let x = rect.minX + rect.width * Double(i) / Double(steps)
                let y = top + amplitude * sin(Double(i) / Double(steps) * 2 * .pi + phase)
                path.addLine(to: CGPoint(x: x, y: y))
            }
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            path.closeSubpath()
            return path
        }
    }
#endif
