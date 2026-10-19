#if os(iOS)
    import SundeckCore
    import SwiftUI

    // Our own segmented control (spec 3.9, decision 8): 44 tall on every iOS version, a white
    // capsule thumb that slides to the chosen segment. For 2 to 5 related views or states; over
    // five, use a `SelectField`.
    //
    //     Segmented(selection: $mode, options: [.jobs, .reports], label: \.title, minSegmentWidth: 112)
    //     Segmented(selection: $appearance, options: Appearance.allCases, label: \.label, minSegmentWidth: 80)

    struct Segmented<Value: Hashable>: View {
        @Binding var selection: Value
        var options: [Value]
        var label: (Value) -> String
        /// Read by screen readers as the group's name ("Appearance").
        var title = ""
        /// Fill the row (equal segments) instead of sizing to the labels.
        var fillsWidth = false
        var minSegmentWidth: CGFloat?
        /// Side padding inside each segment: 16; Day | Week | Month use 12.
        var segmentPadding: CGFloat = 16
        @Namespace private var thumb
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        var body: some View {
            HStack(spacing: 2) {
                ForEach(options, id: \.self) { option in
                    let chosen = option == selection
                    Button {
                        withAnimation(reduceMotion ? nil : .snappy(duration: 0.3, extraBounce: 0.08)) {
                            selection = option
                        }
                    } label: {
                        Text(label(option))
                            .font(.role(.segment).weight(chosen ? .semibold : .medium))
                            .foregroundStyle(Color.text)
                            .lineLimit(1)
                            // Long labels in a full row (Every 2 Weeks) shrink a little, never cut.
                            .minimumScaleFactor(0.8)
                            .padding(.horizontal, segmentPadding)
                            .frame(minWidth: minSegmentWidth, maxWidth: fillsWidth ? .infinity : nil, minHeight: 40)
                            .background {
                                if chosen { SegmentThumb().matchedGeometryEffect(id: "thumb", in: thumb) }
                            }
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(2)
            .glassSurface(
                RoundedRectangle(cornerRadius: CGFloat(Radius.segmentTrack), style: .continuous),
                tint: Color.fill.opacity(0.6), fallback: .fill
            )
            .fixedSize(horizontal: !fillsWidth, vertical: false)
            .sensoryFeedback(.selection, trigger: selection)
            .accessibilityRepresentation {
                Picker(title, selection: $selection) {
                    ForEach(options, id: \.self) { Text(label($0)).tag($0) }
                }
                .pickerStyle(.segmented)
            }
        }
    }

    /// The chosen segment's raised capsule: `thumb` with two soft shadows.
    /// On iOS 26 the thumb is a drop of Liquid Glass sliding over the track, as in the system's
    /// segmented control.
    struct SegmentThumb: View {
        @Environment(\.drawsGlass) private var drawsGlass

        var body: some View {
            if usesGlass(drawsGlass) {
                Color.clear.glassSurface(Capsule(), tint: Color.thumb.opacity(0.7), interactive: true)
            } else {
                Capsule()
                    .fill(Color.thumb)
                    .shadow(color: .black.opacity(0.12), radius: 4, x: 0, y: 3)
                    .shadow(color: .black.opacity(0.04), radius: 0.5, x: 0, y: 3)
            }
        }
    }

    /// The job's section switcher (spec 3.9): the segmented control with equal columns filling the
    /// width, 44 tall segments, footnote labels, and an optional to-do badge per segment.
    ///
    ///     SectionSwitcher(selection: $section, options: sections, label: \.title) { $0 == .checklist ? toDo : 0 }
    struct SectionSwitcher<Value: Hashable>: View {
        @Binding var selection: Value
        var options: [Value]
        var label: (Value) -> String
        /// The count of things still to do on a segment (0: no badge).
        var badge: (Value) -> Int = { _ in 0 }
        @Namespace private var thumb
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        @Environment(\.dynamicTypeSize) private var typeSize

        var body: some View {
            // At accessibility text sizes five equal columns cut every label short ("Det…"), so
            // the segments keep their full labels and the row scrolls sideways.
            if typeSize.isAccessibilitySize {
                ScrollView(.horizontal, showsIndicators: false) { track(fill: false).padding(.top, 8) }
                    .padding(.top, -8)
            } else {
                track(fill: true)
            }
        }

        private func track(fill: Bool) -> some View {
            HStack(spacing: 2) {
                ForEach(options, id: \.self) { option in
                    let chosen = option == selection
                    let count = badge(option)
                    Button {
                        withAnimation(reduceMotion ? nil : .snappy(duration: 0.3, extraBounce: 0.08)) {
                            selection = option
                        }
                    } label: {
                        Text(label(option))
                            .font(.role(.footnote).weight(chosen ? .semibold : .medium))
                            .foregroundStyle(Color.text)
                            .lineLimit(1)
                            .minimumScaleFactor(fill ? 0.8 : 1)
                            .padding(.horizontal, fill ? 4 : 16)
                            .frame(maxWidth: fill ? .infinity : nil, minHeight: minTarget)
                            .background {
                                if chosen { SegmentThumb().matchedGeometryEffect(id: "thumb", in: thumb) }
                            }
                            .overlay(alignment: .topTrailing) {
                                if let text = badgeText(count) { CountBadge(text: text, tone: .warning).offset(y: -6) }
                            }
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(
                        [label(option), toDoAccessibilityText(count)].compactMap { $0 }.joined(separator: ", ")
                    )
                    .accessibilityAddTraits(chosen ? [.isSelected] : [])
                }
            }
            .padding(2)
            .glassSurface(
                RoundedRectangle(cornerRadius: CGFloat(Radius.segmentTrack), style: .continuous),
                tint: Color.fill.opacity(0.6), fallback: .fill
            )
            .sensoryFeedback(.selection, trigger: selection)
        }
    }

    /// A count capsule: 20 tall, at least 20 wide, 6 side padding, tabular. `primary` for unread
    /// counts, `warning` for things to do.
    struct CountBadge: View {
        var text: String
        var tone: Tone? = nil

        var body: some View {
            Text(text)
                .font(.system(size: tone == .warning ? 11 : 12, weight: .semibold))
                .monospacedDigit()
                .rollingNumber(text)
                .foregroundStyle(tone == nil ? Color.onPrimary : Color.onStatus)
                .padding(.horizontal, 6)
                .frame(minWidth: 20, minHeight: 20)
                .background(Capsule().fill(tone?.color ?? Color.brandPrimary))
                .fixedSize()
        }
    }
#endif
