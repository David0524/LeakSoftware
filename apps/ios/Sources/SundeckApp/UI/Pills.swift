#if os(iOS)
    import SwiftUI

    // Filter and chooser pills (spec 3.8): 44 tall capsules, body medium, 8 apart, in a row that
    // scrolls sideways edge to edge with the first pill 16 in. Unselected `fill` with `text`;
    // selected `primary` with `onPrimary` (decision 9).
    //
    //     FilterPills(selection: $filter, options: JobFilter.allCases, label: \.title)
    //
    // Place the row outside the screen's 16 margins (it brings its own).

    struct Pill: View {
        var title: String
        var selected: Bool
        var action: () -> Void

        var body: some View {
            Button(action: action) {
                Text(title)
                    .textRole(.bodyMedium)
                    .lineLimit(1)
                    .foregroundStyle(selected ? Color.onPrimary : Color.text)
                    .padding(.horizontal, 16)
                    .frame(minHeight: minTarget)
                    .background(Capsule().fill(selected ? Color.brandPrimary : Color.fill))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(selected ? [.isSelected] : [])
        }
    }

    struct FilterPills<Value: Hashable>: View {
        @Binding var selection: Value
        var options: [Value]
        var label: (Value) -> String

        var body: some View {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(options, id: \.self) { option in
                        Pill(title: label(option), selected: option == selection) { selection = option }
                    }
                }
            }
            .contentMargins(.horizontal, CGFloat(Spacing.pageMargin), for: .scrollContent)
            .sensoryFeedback(.selection, trigger: selection)
        }
    }
#endif
