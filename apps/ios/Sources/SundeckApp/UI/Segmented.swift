#if os(iOS)
    import SundeckCore
    import SwiftUI

    // The segmented control (spec 3.9, decision 8). On iOS 26 it is the system's own segmented
    // `Picker` (owner, 2026-10-19: "not liquid glass with that slider"): its Liquid Glass thumb
    // can be held and dragged. Before iOS 26 (and in the flat screenshots) it is our own: 44 tall,
    // a white capsule thumb that slides to the chosen segment. For 2 to 5 related views or
    // states; over five, use a `SelectField`.
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
        @State private var held = false
        @State private var frames: [Int: CGRect] = [:]
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        @Environment(\.drawsGlass) private var drawsGlass

        var body: some View {
            if #available(iOS 26, *), drawsGlass {
                SystemSegmented(selection: $selection, options: options, label: label, title: title)
                    .fixedSize(horizontal: !fillsWidth, vertical: false)
                    .keepsHorizontalDrags()
            } else {
                custom.keepsHorizontalDrags()
            }
        }

        private var custom: some View {
            HStack(spacing: 2) {
                ForEach(Array(options.enumerated()), id: \.element) { index, option in
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
                                if chosen {
                                    SegmentThumb(held: held).matchedGeometryEffect(id: "thumb", in: thumb)
                                }
                            }
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .segmentFrame(index) { frames[index] = $0 }
                }
            }
            .padding(2)
            .modifier(SegmentDrag(selection: $selection, options: options, frames: frames, held: $held))
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
        /// Held and being dragged: lifted (a little larger, a deeper shadow), as iOS 26's.
        var held = false
        @Environment(\.drawsGlass) private var drawsGlass
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        var body: some View {
            Group {
                if usesGlass(drawsGlass) {
                    Color.clear.glassSurface(Capsule(), tint: Color.thumb.opacity(0.7), interactive: true)
                } else {
                    Capsule()
                        .fill(Color.thumb)
                        .shadow(color: .black.opacity(held ? 0.2 : 0.12), radius: held ? 10 : 4, x: 0, y: held ? 6 : 3)
                        .shadow(color: .black.opacity(0.04), radius: 0.5, x: 0, y: 3)
                }
            }
            .scaleEffect(held && !reduceMotion ? 1.06 : 1)
        }
    }

    extension View {
        /// Reports a segment's frame in its track, for dragging the thumb along it.
        func segmentFrame(_ index: Int, _ changed: @escaping (CGRect) -> Void) -> some View {
            onGeometryChange(for: CGRect.self) {
                $0.frame(in: .named(segmentTrackSpace))
            } action: {
                changed($0)
            }
        }
    }

    let segmentTrackSpace = "segment-track"

    /// Hold the chosen segment and drag along the track: the selection follows the finger live,
    /// the thumb lifts while held, with selection haptics, like iOS 26's segmented control
    /// (owner, 2026-10-19: "hold the slider/selector like a bubble and drag it around"). A drag
    /// that starts elsewhere, or mostly up and down (scrolling), does nothing. Taps stay the
    /// segments' own buttons.
    struct SegmentDrag<Value: Hashable>: ViewModifier {
        @Binding var selection: Value
        var options: [Value]
        var frames: [Int: CGRect]
        @Binding var held: Bool
        /// nil until the drag decides whether it's on the chosen segment.
        @State private var active: Bool?
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        func body(content: Content) -> some View {
            content
                .coordinateSpace(.named(segmentTrackSpace))
                .simultaneousGesture(
                    DragGesture(minimumDistance: 4, coordinateSpace: .named(segmentTrackSpace))
                        .onChanged { value in
                            if active == nil {
                                let chosen = options.firstIndex(of: selection).flatMap { frames[$0] }
                                active =
                                    chosen?.insetBy(dx: -2, dy: -8).contains(value.startLocation) == true
                                    && abs(value.translation.width) >= abs(value.translation.height)
                                if active == true { withAnimation(lift) { held = true } }
                            }
                            guard active == true,
                                let index = frames.first(where: {
                                    $0.value.minX <= value.location.x && value.location.x <= $0.value.maxX
                                })?.key,
                                options.indices.contains(index), options[index] != selection
                            else { return }
                            withAnimation(reduceMotion ? nil : .snappy(duration: 0.25, extraBounce: 0.05)) {
                                selection = options[index]
                            }
                        }
                        .onEnded { _ in
                            active = nil
                            withAnimation(lift) { held = false }
                        }
                )
        }

        private var lift: Animation? { reduceMotion ? nil : .spring(duration: 0.25) }
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
        @State private var held = false
        @State private var frames: [Int: CGRect] = [:]
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        @Environment(\.dynamicTypeSize) private var typeSize
        @Environment(\.drawsGlass) private var drawsGlass

        var body: some View {
            // At accessibility text sizes five equal columns cut every label short ("Det…"), so
            // the segments keep their full labels and the row scrolls sideways in our own track.
            if #available(iOS 26, *), drawsGlass, !typeSize.isAccessibilitySize {
                // The system control (equal segments), each to-do count as a badge over its segment.
                SystemSegmented(
                    selection: $selection, options: options, label: label, title: "Job sections",
                    hint: options.compactMap { o in toDoAccessibilityText(badge(o)).map { "\(label(o)), \($0)" } }
                        .joined(separator: ". ")
                )
                .overlay {
                    GeometryReader { geo in
                        let width = geo.size.width / CGFloat(max(1, options.count))
                        ForEach(Array(options.enumerated()), id: \.element) { index, option in
                            if let text = badgeText(badge(option)) {
                                CountBadge(text: text, tone: .warning)
                                    .position(x: width * CGFloat(index + 1) - 12, y: 2)
                            }
                        }
                    }
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                }
            } else if typeSize.isAccessibilitySize {
                ScrollView(.horizontal, showsIndicators: false) { track(fill: false).padding(.top, 8) }
                    .padding(.top, -8)
            } else {
                track(fill: true)
            }
        }

        private func track(fill: Bool) -> some View {
            HStack(spacing: 2) {
                ForEach(Array(options.enumerated()), id: \.element) { index, option in
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
                                if chosen {
                                    SegmentThumb(held: held).matchedGeometryEffect(id: "thumb", in: thumb)
                                }
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
                    .segmentFrame(index) { frames[index] = $0 }
                }
            }
            .padding(2)
            .modifier(SegmentDrag(selection: $selection, options: options, frames: frames, held: $held))
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

#if os(iOS)
    /// iOS 26's segmented control: the system `Picker`, large (about 44 tall), its glass thumb
    /// held and dragged like the system's everywhere.
    @available(iOS 26, *)
    struct SystemSegmented<Value: Hashable>: View {
        @Binding var selection: Value
        var options: [Value]
        var label: (Value) -> String
        var title: String
        var hint = ""

        var body: some View {
            Picker(title, selection: $selection) {
                ForEach(options, id: \.self) { Text(label($0)).tag($0) }
            }
            .pickerStyle(.segmented)
            .controlSize(.large)
            .labelsHidden()
            .accessibilityLabel(title)
            .accessibilityHint(hint)
            .sensoryFeedback(.selection, trigger: selection)
        }
    }
#endif
