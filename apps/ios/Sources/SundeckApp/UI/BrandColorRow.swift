#if os(iOS)
    import SundeckCore
    import SwiftUI
    import UIKit

    // The shop's colors in Settings › Company and Branding (owner, 2026-10-22: "You should auto
    // fill company colors based on the logo, and give a picker. A hex code alone is not
    // useful"). Same as the website's ColorField (apps/web/src/components/settings-forms.tsx):
    // the system color picker at the row's end, the hex small beside it, and swatches with the
    // logo's colors first.

    /// A logo's pixels as RGBA bytes, at most 96 px on the long side, for `logoPalette`.
    func logoPixels(_ image: UIImage, side: Int = 96) -> [UInt8] {
        guard let cg = image.cgImage, cg.width > 0, cg.height > 0 else { return [] }
        let scale = min(1, Double(side) / Double(max(cg.width, cg.height)))
        let w = max(1, Int((Double(cg.width) * scale).rounded()))
        let h = max(1, Int((Double(cg.height) * scale).rounded()))
        var data = [UInt8](repeating: 0, count: w * h * 4)
        let drawn = data.withUnsafeMutableBytes { buffer -> Bool in
            guard
                let ctx = CGContext(
                    data: buffer.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return false }
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        return drawn ? data : []
    }

    /// `#RRGGBB` as a SwiftUI color.
    func colorFromHex(_ hex: String) -> Color? {
        guard isHexColor(hex), let rgb = hexRGB(hex) else { return nil }
        return Color(red: rgb.red, green: rgb.green, blue: rgb.blue)
    }

    /// A SwiftUI color as `#RRGGBB` (sRGB, clamped).
    func hexFromColor(_ color: Color) -> String {
        var r: CGFloat = 0
        var g: CGFloat = 0
        var b: CGFloat = 0
        var a: CGFloat = 0
        UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        func byte(_ v: CGFloat) -> String { String(format: "%02X", Int((min(1, max(0, v)) * 255).rounded())) }
        return "#\(byte(r))\(byte(g))\(byte(b))"
    }

    /// "Main color" or "Accent color": a grouped row with the picker at its end, then swatches.
    struct BrandColorRow: View {
        var label: String
        @Binding var hex: String
        var logoColors: [String]
        var optional = false
        /// "Color picked from your logo." after the logo filled it.
        var note: String?
        /// Told when the owner picks a color themselves.
        var onPick: () -> Void = {}

        private var valid: Bool { isHexColor(hex) }
        private var logo: [String] {
            var seen: [String] = []
            for c in logoColors.map({ $0.uppercased() }) where !seen.contains(c) { seen.append(c) }
            return seen
        }
        private var others: [String] {
            brandColorChoices([], current: valid ? hex : nil).filter { !logo.contains($0) }
        }

        private var picker: Binding<Color> {
            Binding(
                get: { colorFromHex(hex) ?? colorFromHex(defaultBrandColor) ?? .black },
                set: {
                    hex = hexFromColor($0)
                    onPick()
                })
        }

        var body: some View {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    Text(label).textRole(.body).foregroundStyle(Color.text)
                    if optional { Text("(optional)").textRole(.body).foregroundStyle(Color.textMuted) }
                    Spacer(minLength: 8)
                    Text(valid ? hex.uppercased() : "None")
                        .textRole(.secondary).monospaced().foregroundStyle(Color.textMuted)
                        .accessibilityHidden(true)
                    ColorPicker(label, selection: picker, supportsOpacity: false)
                        .labelsHidden()
                        .frame(minWidth: 44, minHeight: 44)
                        .accessibilityValue(valid ? hex.uppercased() : "None")
                }
                if !logo.isEmpty {
                    swatches("From your logo", logo, none: false)
                }
                swatches(logo.isEmpty ? nil : "More colors", others, none: optional)
                if let note { Text(note).textRole(.secondary).foregroundStyle(Color.textMuted) }
                if valid && !optional {
                    let text = textOnBrand(hex)
                    HStack(spacing: 8) {
                        Text("Report header")
                            .textRole(.bodyEmphasis)
                            .foregroundStyle(colorFromHex(text) ?? .white)
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(Capsule().fill(colorFromHex(hex) ?? .clear))
                        if text != "#FFFFFF" {
                            Text("A light color: documents use dark text on it.")
                                .textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, CGFloat(Spacing.rowVertical))
        }

        @ViewBuilder
        private func swatches(_ title: String?, _ colors: [String], none: Bool) -> some View {
            VStack(alignment: .leading, spacing: 2) {
                if let title { Text(title).textRole(.footnote).foregroundStyle(Color.textMuted) }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 44, maximum: 44), spacing: 2)], spacing: 2) {
                    if none { swatch("", title: "None") }
                    ForEach(colors, id: \.self) { c in
                        swatch(c, title: title == "From your logo" ? "\(c), from your logo" : c)
                    }
                }
                .padding(.horizontal, -6)
            }
        }

        private func swatch(_ c: String, title: String) -> some View {
            let selected = c.isEmpty ? !valid : hex.uppercased() == c
            return Button {
                hex = c
                onPick()
            } label: {
                ZStack {
                    if let color = colorFromHex(c) {
                        Circle().fill(color)
                    } else {
                        Circle().fill(Color.surface)
                        Rectangle().fill(Color.textMuted).frame(width: 1.5).rotationEffect(.degrees(45))
                    }
                    Circle().strokeBorder(Color.controlBorder, lineWidth: 1)
                }
                .frame(width: 32, height: 32)
                .clipShape(Circle())
                .padding(3)
                .overlay(Circle().strokeBorder(selected ? Color.link : .clear, lineWidth: 2))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(title)
            .accessibilityAddTraits(selected ? .isSelected : [])
        }
    }
#endif
