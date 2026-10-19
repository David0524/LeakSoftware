#if os(iOS)
    import SundeckCore
    import SundeckTokens
    import SwiftUI

    /// A box to sign in with a finger, and Clear. Strokes are points in the box's own coordinates
    /// (points, from its top-left corner), as the Expo pad stores them, so `signatureSvg` gives
    /// the same drawing. `drawing` is true while a finger is down, so a scrolling page can hold
    /// still. Port of apps/mobile/src/ui/SignaturePad.tsx.
    struct SignaturePad: View {
        var strokes: [SignatureStroke]
        var onChange: ([SignatureStroke]) -> Void
        @Binding var drawing: Bool
        var height: CGFloat = 220

        @State private var live: SignatureStroke?

        var body: some View {
            VStack(alignment: .trailing, spacing: 4) {
                box
                Button("Clear") { onChange([]) }
                    .font(.body.weight(.semibold))
                    .buttonStyle(.borderless)
                    .frame(minWidth: minTarget, minHeight: minTarget)
                    .disabled(strokes.isEmpty)
            }
        }

        private var box: some View {
            Canvas { context, _ in
                for stroke in strokes + (live.map { [$0] } ?? []) {
                    context.stroke(
                        path(stroke), with: .color(.primary),
                        style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(alignment: .bottom) {
                // The line to sign on.
                Rectangle().fill(Color.controlBorder).frame(height: 1)
                    .padding(.horizontal, 24).padding(.bottom, 48)
            }
            .background(Color(Tokens.Role.surface))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.controlBorder, lineWidth: 1))
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0, coordinateSpace: .local)
                    .onChanged { value in
                        let point = SIMD2(Double(value.location.x), Double(value.location.y))
                        if live == nil {
                            live = [SIMD2(Double(value.startLocation.x), Double(value.startLocation.y))]
                            drawing = true
                        }
                        if live?.last != point { live?.append(point) }
                    }
                    .onEnded { _ in
                        if let stroke = live, !stroke.isEmpty { onChange(strokes + [stroke]) }
                        live = nil
                        drawing = false
                    }
            )
            // VoiceOver can't draw by gestures, so the box passes touches straight through.
            .accessibilityElement()
            .accessibilityLabel("Signature box. Sign with your finger.")
            .accessibilityValue(strokes.isEmpty ? "Empty" : "Signed")
            .accessibilityHint("With VoiceOver on, touches in this box draw directly.")
            .accessibilityAddTraits(.allowsDirectInteraction)
        }

        private func path(_ stroke: SignatureStroke) -> Path {
            var path = Path()
            guard let first = stroke.first else { return path }
            path.move(to: CGPoint(x: first.x, y: first.y))
            // A single point is a dot, as in strokePath ("l0.1 0").
            if stroke.count == 1 { path.addLine(to: CGPoint(x: first.x + 0.1, y: first.y)) }
            for point in stroke.dropFirst() { path.addLine(to: CGPoint(x: point.x, y: point.y)) }
            return path
        }
    }
#endif
