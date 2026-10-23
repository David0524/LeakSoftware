#if os(iOS)
    import MapKit
    import SundeckCore
    import SundeckTokens
    import SwiftUI

    // SwiftUI's Map lives in MapKit's SwiftUI overlay, which Xcode imports by itself with MapKit
    // and SwiftUI; SwiftPM builds (xtool) need it named.
    #if canImport(_MapKit_SwiftUI)
        import _MapKit_SwiftUI
    #endif

    // A tech's day as an Apple Maps map on Schedule (owner, 2026-10-20, docs/plans/route-maps.md;
    // the website's components/day-map.tsx and interactive-map.tsx). The pins come from core
    // `dayMapPins` (Model/RouteMaps.swift): the shop as a navy house, the stops numbered in route
    // order. Since 2026-10-23 (owner: "Bold tech-colored routes") the route is drawn in the tech's
    // team color, as on the website and Android (core `ROUTE_STYLE`): a bold line on a white
    // casing, 34 pt stops in that color, done stops fainter, and the stop you're on larger with a
    // white ring and a navy ring outside it. Apple's full-color map, as on the website (owner,
    // 2026-10-23: the muted one looked dull), with no points of interest so the pins stay
    // forward; Apple's logo and legal link stay uncovered in the bottom corners.

    extension LatLng {
        var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lng) }
    }

    extension MapFit {
        var region: MKCoordinateRegion {
            MKCoordinateRegion(
                center: center.coordinate, span: MKCoordinateSpan(latitudeDelta: latDelta, longitudeDelta: lngDelta))
        }
    }

    /// A pin (core `ROUTE_STYLE`): the stop's number in a circle of the route's color with a white
    /// edge so it reads on any street; a done stop quieter (a light tint of the color ringed in it,
    /// numbered in the text color, so it still reads); the stop you're on larger, ringed in
    /// white and navy; the shop a navy house. Selected, it grows and gets a ring in the route's
    /// color. Status is never color alone: VoiceOver reads each pin ("Stop 2, Grace Holloway").
    struct MapPinDot: View {
        var annotation: DayMapAnnotation
        /// The route's color (the tech's team color).
        var route: Color = .water
        var selected = false
        /// The still map on Schedule draws its pins a little smaller than the large map.
        var scale: CGFloat = 1

        private var current: Bool { annotation.tone == .current }
        private var done: Bool { annotation.tone == .done }

        /// The circle with its white edge (inside the navy ring for the stop you're on).
        private var size: CGFloat {
            let s = routeStyle
            let points =
                annotation.isShop
                ? s.startPinSize : current ? s.currentPinSize - 2 * s.currentNavyRing : s.pinSize
            return CGFloat(points) * scale
        }

        private var edge: CGFloat {
            let s = routeStyle
            return CGFloat(current ? s.currentWhiteRing : annotation.isShop ? 2 : done ? s.pinEdge + 1 : s.pinEdge)
                * scale
        }

        /// The circle's fill: navy for the shop, a light tint of the route's color (over the
        /// surface, so it follows dark mode) once done, else the route's color.
        @ViewBuilder private var fill: some View {
            if annotation.isShop {
                Circle().fill(Color.navy)
            } else if done {
                Circle().fill(Color.surface).overlay(Circle().fill(route.opacity(routeStyle.doneTint)))
            } else {
                Circle().fill(route)
            }
        }

        var body: some View {
            ZStack {
                fill
                if annotation.isShop {
                    Image(systemName: "house.fill")
                        .font(.system(size: size * 0.46, weight: .semibold))
                } else {
                    Text(annotation.label)
                        .font(.system(size: size * 0.46, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .minimumScaleFactor(0.6)
                }
            }
            .foregroundStyle(done ? Color.text : .white)
            .frame(width: size, height: size)
            .overlay(Circle().strokeBorder(done ? route : .white, lineWidth: edge))
            .padding(current ? CGFloat(routeStyle.currentNavyRing) * scale : 0)
            .background { if current { Circle().fill(Color.navy) } }
            .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
            .padding(selected ? 3 : 0)
            .overlay { if selected { Circle().strokeBorder(route, lineWidth: 3) } }
            .scaleEffect(selected ? 1.15 : 1)
            .animation(Motion.snappy, value: selected)
            // Someone who starts from home: the house is labeled Home (never the street), under
            // the pin so the circle stays on the point.
            .overlay(alignment: .bottom) {
                if annotation.home {
                    Text(StartFromCopy.homePin)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.navy)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1)
                        .background(Capsule().fill(.white))
                        .fixedSize()
                        .offset(y: size * 0.5 + 10)
                        .accessibilityHidden(true)
                }
            }
        }
    }

    /// The map itself: the line, then the pins (the shop under the stops). `onPick` makes each
    /// pin a 44 pt button; without it the pins are pictures and the map's own tap is the action.
    extension EnvironmentValues {
        /// Draws MapKit's live map. Screenshot tests turn it off: drawing the window to an image
        /// while MapKit is still loading its tiles crashes in CoreGraphics (CI, 2026-10-21).
        @Entry var drawsLiveMaps = true
    }

    struct DayMapCanvas: View {
        @Environment(\.drawsLiveMaps) private var drawsLiveMaps
        var model: DayMapModel
        @Binding var position: MapCameraPosition
        var interactive: Bool
        var selected: String?
        var pinScale: CGFloat = 1
        var onPick: ((String) -> Void)?

        var body: some View {
            if drawsLiveMaps {
                live
            } else {
                // A still stand-in of the same size: the map's tint, no tiles.
                Rectangle().fill(Color.water.opacity(0.1)).accessibilityHidden(true)
            }
        }

        private var live: some View {
            Map(position: $position, interactionModes: interactive ? [.pan, .zoom, .rotate] : []) {
                if model.line.count > 1 {
                    // The route in the tech's color on a white casing, so it reads on any street.
                    MapPolyline(coordinates: model.line.map(\.coordinate))
                        .stroke(
                            Color.white,
                            style: StrokeStyle(
                                lineWidth: CGFloat(routeStyle.casingWidth), lineCap: .round, lineJoin: .round))
                    MapPolyline(coordinates: model.line.map(\.coordinate))
                        .stroke(
                            model.color.color,
                            style: StrokeStyle(
                                lineWidth: CGFloat(routeStyle.lineWidth), lineCap: .round, lineJoin: .round))
                }
                // The shop first, so stops draw over it where they're close.
                ForEach(model.annotations.sorted { $0.isShop && !$1.isShop }) { a in
                    Annotation(a.spoken, coordinate: a.at.coordinate, anchor: .center) {
                        pin(a)
                    }
                    .annotationTitles(.hidden)
                }
            }
            .mapStyle(.standard(emphasis: .automatic, pointsOfInterest: .excludingAll))
            .mapControls {
                if interactive {
                    MapCompass()
                    MapScaleView()
                }
            }
        }

        @ViewBuilder private func pin(_ a: DayMapAnnotation) -> some View {
            let dot = MapPinDot(annotation: a, route: model.color.color, selected: selected == a.id, scale: pinScale)
            if let onPick, !a.isShop {
                Button {
                    onPick(a.id)
                } label: {
                    dot.frame(minWidth: minTarget, minHeight: minTarget).contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(a.spoken)
                .accessibilityAddTraits(selected == a.id ? .isSelected : [])
            } else {
                // The still map's own tap opens Enlarge, pins included.
                dot.allowsHitTesting(false).accessibilityLabel(a.spoken)
            }
        }
    }

    /// Phones, one tech's day (the website's DayLead): a Map row that folds the map away
    /// (remembered on this phone; open until closed), the map, and what isn't on it. Tapping the map
    /// or Enlarge opens the large map with the day's stops.
    struct DayMapSection: View {
        var model: DayMapModel
        @AppStorage("schedule.dayMapOpen") private var open = true
        @State private var position: MapCameraPosition = .automatic
        @State private var enlarged = false
        /// The map keeps its height at every text size, so the stops still start near the top.
        private let height: CGFloat = 200

        var body: some View {
            VStack(alignment: .leading, spacing: 8) {
                if model.drawable {
                    disclosure
                    if open {
                        map.transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
                if let note = model.note, open || !model.drawable {
                    Text(note).textRole(.secondary).foregroundStyle(Color.textMuted)
                }
            }
            .clipped()
            .onAppear { fit() }
            .onChange(of: model.fit) { fit() }
            .sheet(isPresented: $enlarged) { DayMapSheet(model: model) }
        }

        /// "Map" with "Hide" or "5 stops" and a chevron: a disclosure row, 44 tall.
        private var disclosure: some View {
            Button {
                withAnimation(Motion.smooth) { open.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Text("Map").textRole(.bodyEmphasis).foregroundStyle(Color.text)
                    Spacer(minLength: 8)
                    Text(mapDisclosureDetail(open: open, stops: model.stops.count))
                        .textRole(.secondary).foregroundStyle(Color.textMuted)
                        .contentTransition(.opacity)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.textMuted)
                        .rotationEffect(.degrees(open ? 90 : 0))
                        .accessibilityHidden(true)
                }
                .frame(minHeight: minTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Map")
            .accessibilityValue(
                open ? "Shown" : "Hidden, \(mapDisclosureDetail(open: false, stops: model.stops.count))"
            )
            .accessibilityHint(open ? "Hides the map" : "Shows the map")
        }

        /// The day at a glance: a still map (the page keeps scrolling under a thumb), which opens
        /// the large, interactive one.
        private var map: some View {
            let shape = RoundedRectangle(cornerRadius: CGFloat(Radius.card), style: .continuous)
            return DayMapCanvas(model: model, position: $position, interactive: false, selected: nil, pinScale: 0.88)
                .frame(height: height)
                .clipShape(shape)
                .overlay(shape.strokeBorder(Color.text.opacity(0.08), lineWidth: 1).allowsHitTesting(false))
                .contentShape(shape)
                .onTapGesture { enlarged = true }
                // The map is named and holds each stop's pin; Enlarge is the button.
                .accessibilityElement(children: .contain)
                .accessibilityLabel(model.label)
                .overlay(alignment: .topTrailing) {
                    Button {
                        enlarged = true
                    } label: {
                        Image(systemName: "arrow.up.left.and.arrow.down.right")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Color.text)
                            .frame(width: 36, height: 36)
                            .glassSurface(Circle(), interactive: true)
                            .frame(width: minTarget, height: minTarget)
                            .contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .padding(4)
                    .accessibilityLabel("Enlarge Map")
                }
        }

        private func fit() {
            if let fit = model.fit { position = .region(fit.region) }
        }
    }

    /// Enlarge: "{Tech} · {Monday}", a large map to pan and zoom, and the day's stops below it.
    /// Tapping a pin marks its row and scrolls to it; tapping a row marks its pin and brings the
    /// map to it.
    struct DayMapSheet: View {
        var model: DayMapModel
        @Environment(\.dismiss) private var dismiss
        @State private var position: MapCameraPosition = .automatic
        @State private var selected: String?
        @State private var span: MKCoordinateSpan?

        var body: some View {
            NavigationStack {
                ScrollViewReader { proxy in
                    VStack(spacing: 0) {
                        DayMapCanvas(
                            model: model, position: $position, interactive: true, selected: selected
                        ) { id in
                            withAnimation(Motion.snappy) { selected = selected == id ? nil : id }
                            if selected == id { withAnimation(Motion.smooth) { proxy.scrollTo(id, anchor: .center) } }
                        }
                        .onMapCameraChange { span = $0.region.span }
                        .containerRelativeFrame(.vertical) { h, _ in h * 0.55 }
                        .accessibilityElement(children: .contain)
                        .accessibilityLabel(model.label)
                        ScrollView {
                            VStack(alignment: .leading, spacing: 8) {
                                list
                                if let note = model.note {
                                    Text(note).textRole(.secondary).foregroundStyle(Color.textMuted)
                                        .padding(.horizontal, 16)
                                }
                            }
                            .padding(16)
                        }
                    }
                }
                .background(Color.bg)
                .navigationTitle(model.title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
                }
            }
            .sheetPresentation(detents: [.large])
            .onAppear {
                if let fit = model.fit { position = .region(fit.region) }
            }
        }

        private var list: some View {
            Grouped {
                ForEach(model.stops) { s in
                    let on = selected == s.id
                    Button {
                        withAnimation(Motion.snappy) { selected = on ? nil : s.id }
                        if !on { focus(s.id) }
                    } label: {
                        HStack(spacing: 12) {
                            Text("\(s.number)")
                                .font(.system(size: 15, weight: .bold, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(on ? Color.white : Color.text)
                                .frame(width: 30, height: 30)
                                .background(Circle().fill(on ? Color.link : Color.fill))
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(s.time).textRole(.bodyEmphasis).monospacedDigit().foregroundStyle(Color.text)
                                Text(s.customer).textRole(.secondary).foregroundStyle(Color.textMuted).lineLimit(1)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            if !s.located {
                                Text(NotOnMap.short).textRole(.footnote).foregroundStyle(Color.textMuted)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .frame(minHeight: minTarget)
                        .background(on ? Color.link.opacity(0.1) : .clear)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.row)
                    .disabled(!s.located)
                    .id(s.id)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(
                        "Stop \(s.number), \(s.time), \(s.customer)" + (s.located ? "" : ", \(NotOnMap.short)")
                    )
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
        }

        /// The map moves to the stop, keeping its zoom (closer in when it was showing the whole day).
        private func focus(_ id: String) {
            guard let a = model.annotations.first(where: { $0.id == id }) else { return }
            let whole = model.fit.map { MKCoordinateSpan(latitudeDelta: $0.latDelta, longitudeDelta: $0.lngDelta) }
            let now = span ?? whole ?? MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
            let zoom = MKCoordinateSpan(
                latitudeDelta: min(now.latitudeDelta, (whole?.latitudeDelta ?? 0.05) / 2),
                longitudeDelta: min(now.longitudeDelta, (whole?.longitudeDelta ?? 0.05) / 2))
            withAnimation(Motion.smooth) {
                position = .region(MKCoordinateRegion(center: a.at.coordinate, span: zoom))
            }
        }
    }

    /// What keeps a job in place, small and muted (the website's `LockTag`): a lock is an icon
    /// only (owner, 2026-10-20: "Do icons"), a calendar with a padlock (day), a clock with a padlock
    /// (time) or a padlock (both), spoken and shown on hover as its label; "Two techs" stays words.
    struct LockTagLabel: View {
        var tag: LockTag

        var body: some View {
            if tag.kind == .twoTechs {
                Text(tag.label)
                    .font(.role(.footnote).weight(.semibold))
                    .foregroundStyle(Color.textMuted)
                    .lineLimit(1)
            } else {
                LockIcon(kind: tag.kind)
                    .foregroundStyle(Color.textMuted)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(tag.label)
                    .help(tag.label)
            }
        }
    }

    /// The lock's symbol at about 17 pt: `calendar` or `clock` with a small `lock.fill` at its
    /// bottom trailing corner (composed: SF Symbols has no calendar or clock padlock for iOS 18),
    /// or `lock.fill` for both.
    struct LockIcon: View {
        var kind: LockTag.Kind
        @ScaledMetric(relativeTo: .body) private var size: CGFloat = 17

        var body: some View {
            switch kind {
            case .day: badged("calendar")
            case .time: badged("clock")
            case .both, .twoTechs:
                Image(systemName: "lock.fill").font(.system(size: size, weight: .medium))
            }
        }

        private func badged(_ base: String) -> some View {
            let badge = size * 0.62
            let dx = size * 0.22
            let dy = size * 0.18
            return Image(systemName: base)
                .font(.system(size: size, weight: .regular))
                // A gap around the padlock, cut out so it reads on any background.
                .mask {
                    Rectangle()
                        .overlay(alignment: .bottomTrailing) {
                            Circle().frame(width: badge, height: badge).offset(x: dx, y: dy)
                                .blendMode(.destinationOut)
                        }
                        .compositingGroup()
                }
                .overlay(alignment: .bottomTrailing) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: size * 0.45, weight: .bold))
                        .frame(width: badge, height: badge)
                        .offset(x: dx, y: dy)
                }
                .padding(.trailing, dx)
                .padding(.bottom, dy)
        }
    }

#endif
