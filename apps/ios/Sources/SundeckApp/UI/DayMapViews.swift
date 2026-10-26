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
    // forward; Apple's logo and legal link stay uncovered in the bottom corners. Since 2026-10-23
    // (owner) the route follows the roads (MapKit's paths on the phone, Model/RoadPaths.swift;
    // straight until they come, or where there's none), and as the map zooms out its line thins
    // and its pins shrink (core `routeStyleAt`), the stop you're on still a little larger and
    // ringed. Since 2026-10-24 (owner: "the dots aren't placed great and the stops aren't
    // numbered") every pin keeps its number, and pins too close at the map's zoom are drawn apart
    // with a thin line back to a small dot on their place (core `spreadPins`, as the website).

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
        /// The route's sizes at the map's zoom (core `routeStyleAt`): smaller zoomed out.
        var sizes: RouteSizes = routeStyleAt(routeZoom.full)

        private var current: Bool { annotation.tone == .current }
        private var done: Bool { annotation.tone == .done }

        /// The circle with its white edge (inside the navy ring for the stop you're on).
        private var size: CGFloat {
            let s = sizes
            let points =
                annotation.isShop
                ? s.startPinSize : current ? s.currentPinSize - 2 * s.currentNavyRing : s.pinSize
            return CGFloat(points) * scale
        }

        private var edge: CGFloat {
            let s = sizes
            let shopEdge = min(2, s.pinEdge + 0.5)
            return CGFloat(
                current ? s.currentWhiteRing : annotation.isShop ? shopEdge : done ? s.pinEdge + 1 : s.pinEdge)
                * scale
        }

        /// The number's size: half the pin, a little more on the smaller pins.
        private var numberSize: CGFloat {
            let points = CGFloat(current ? sizes.currentPinSize : sizes.pinSize) * scale
            return points * (0.5 + max(0, (34 - points) / 100))
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
                // Numbered at every size, in the display face, a little larger for its size on
                // the smaller pins so it still reads (as the website's pins).
                if annotation.isShop {
                    Image(systemName: "house.fill")
                        .font(.system(size: size * 0.46, weight: .semibold))
                } else {
                    Text(annotation.label)
                        .font(.custom(BrandFonts.Weight.bold.rawValue, fixedSize: numberSize))
                        .monospacedDigit()
                        .minimumScaleFactor(0.6)
                }
            }
            .foregroundStyle(done ? Color.text : .white)
            .frame(width: size, height: size)
            .overlay(Circle().strokeBorder(done ? route : .white, lineWidth: edge))
            .padding(current ? CGFloat(sizes.currentNavyRing) * scale : 0)
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

    /// A moved pin's leader line (core `SPREAD`): from the pin's middle back to a small dot on its
    /// place, `dx` and `dy` points away, in the route's color on a white edge.
    struct PinLeader: View {
        var dx: Double
        var dy: Double
        var color: Color

        private struct Line: Shape {
            var dx: Double
            var dy: Double

            func path(in rect: CGRect) -> Path {
                var p = Path()
                p.move(to: CGPoint(x: rect.midX, y: rect.midY))
                p.addLine(to: CGPoint(x: rect.midX - dx, y: rect.midY - dy))
                return p
            }
        }

        var body: some View {
            let width = CGFloat(spread.leaderWidth)
            let dot = CGFloat(spread.leaderDot)
            ZStack {
                Line(dx: dx, dy: dy).stroke(Color.white, style: StrokeStyle(lineWidth: width + 1.5, lineCap: .round))
                Line(dx: dx, dy: dy).stroke(color, style: StrokeStyle(lineWidth: width, lineCap: .round))
                Circle().fill(color).overlay(Circle().strokeBorder(Color.white, lineWidth: 1))
                    .frame(width: dot, height: dot)
                    .offset(x: -dx, y: -dy)
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
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
        /// The route along the roads (straight until MapKit's paths come).
        @State private var road: [LatLng] = []
        /// The map's zoom, to a twentieth (so the pins move only when it really changes); their
        /// sizes follow it to a quarter step.
        @State private var zoom = routeZoom.full
        /// The camera's middle, for keeping the still map's pins inside it and off Enlarge.
        @State private var center: LatLng?
        @State private var size: CGSize = .zero

        /// Smaller while the pins would overlap at this zoom (core `crowdedStyleAt`; owner,
        /// 2026-10-24: never a pile of pins).
        private var sizes: RouteSizes { crowdedStyleAt((zoom * 4).rounded() / 4, model.placed) }

        /// Where each pin is drawn: apart from its neighbors where they'd overlap, with a leader
        /// line back to its place (owner, 2026-10-24: "the dots aren't placed great"). The still
        /// map keeps them inside its edges and out of the Enlarge corner.
        private var spots: [String: PinSpot] {
            let frame =
                interactive || size.width <= 0
                ? nil : center.map { (center: $0, w: Double(size.width), h: Double(size.height)) }
            return model.spots(zoom: zoom, sizes: sizes, frame: frame)
        }

        /// The stop you're on drawn last, so it's on top; the start first, under the stops.
        private var layered: [DayMapAnnotation] {
            let layer: [PinTone: Int] = [.shop: 0, .done: 1, .todo: 2, .current: 3]
            return model.annotations.enumerated()
                .sorted { (layer[$0.element.tone] ?? 0, $0.offset) < (layer[$1.element.tone] ?? 0, $1.offset) }
                .map(\.element)
        }

        var body: some View {
            if drawsLiveMaps {
                live
                    .onGeometryChange(for: CGSize.self) {
                        $0.size
                    } action: {
                        size = $0
                    }
                    .onMapCameraChange(frequency: .continuous) { context in
                        let z =
                            (zoomForSpan(context.region.span.longitudeDelta, Double(size.width)) * 20).rounded() / 20
                        if z != zoom { zoom = z }
                        let c = context.region.center
                        if !interactive { center = LatLng(lat: c.latitude, lng: c.longitude) }
                    }
                    .task(id: model.line) {
                        road = RoadPaths.shared.kept(model.line)
                        // MapKit asks one leg at a time and stops at its limit; the legs left (the
                        // drive home is always last) are asked after a wait, while the map shows.
                        for _ in 0..<4 {
                            let got = await RoadPaths.shared.route(model.line)
                            road = got.line
                            if got.done || Task.isCancelled { break }
                            try? await Task.sleep(for: RoadPaths.throttleWait)
                        }
                    }
            } else {
                // A still stand-in of the same size: the map's tint, no tiles.
                Rectangle().fill(Color.water.opacity(0.1)).accessibilityHidden(true)
            }
        }

        private var live: some View {
            let line = road.count > 1 ? road : model.line
            return Map(position: $position, interactionModes: interactive ? [.pan, .zoom, .rotate] : []) {
                if line.count > 1 {
                    // The route in the tech's color on a white casing, so it reads on any street;
                    // thinner zoomed out.
                    MapPolyline(coordinates: line.map(\.coordinate))
                        .stroke(
                            Color.white,
                            style: StrokeStyle(
                                lineWidth: CGFloat(sizes.casingWidth), lineCap: .round, lineJoin: .round))
                    MapPolyline(coordinates: line.map(\.coordinate))
                        .stroke(
                            model.color.color,
                            style: StrokeStyle(
                                lineWidth: CGFloat(sizes.lineWidth), lineCap: .round, lineJoin: .round))
                }
                // The shop first, so stops draw over it where they're close; each pin where it's
                // drawn (apart from its neighbors), its leader line back to its place.
                let drawnAt = spots
                ForEach(layered) { a in
                    let spot = drawnAt[a.id]
                    Annotation(a.spoken, coordinate: (spot?.at ?? a.at).coordinate, anchor: .center) {
                        pin(a)
                            .background {
                                if let spot, spot.leader {
                                    PinLeader(dx: spot.dx, dy: spot.dy, color: model.color.color)
                                }
                            }
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
            let dot = MapPinDot(
                annotation: a, route: model.color.color, selected: selected == a.id, scale: pinScale, sizes: sizes)
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
        @State private var width: CGFloat = 0
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
                .onGeometryChange(for: CGFloat.self) {
                    $0.size.width
                } action: {
                    width = $0
                    fit()
                }
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
            if let fit = model.fit(w: Double(width), h: Double(height)) { position = .region(fit.region) }
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
        @State private var size: CGSize = .zero

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
                        .onGeometryChange(for: CGSize.self) {
                            $0.size
                        } action: {
                            let first = size == .zero
                            size = $0
                            if first { fitWhole() }
                        }
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
            .onAppear { fitWhole() }
        }

        /// The whole day, framed as the map images are (core `mapView`).
        private func fitWhole() {
            if let fit = model.fit(w: Double(size.width), h: Double(size.height)) { position = .region(fit.region) }
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
                                .foregroundStyle(on ? Color.onStatus : Color.text)
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
            let whole = model.fit(w: Double(size.width), h: Double(size.height)).map {
                MKCoordinateSpan(latitudeDelta: $0.latDelta, longitudeDelta: $0.lngDelta)
            }
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
