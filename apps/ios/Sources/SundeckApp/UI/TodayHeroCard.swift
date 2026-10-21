#if os(iOS)
    import SundeckCore
    import SundeckLiveStop
    import SundeckSync
    import SundeckTokens
    import SwiftUI

    /// Today's card for the stop the tech is on (owner, 2026-10-20; docs/plans/today-hero.md),
    /// laid out as docs/design/2026-10-20-today-card.md specifies for every platform: the Live
    /// Activity brought into the app, in its water blue, from the same rule (core `todayHero`), so
    /// the Lock Screen and the card always pick the same stop. The top names the moment ("At the
    /// pool · Stop 2 of 3", core `heroHeadline`); the customer's name opens the job; the address
    /// is plain text (Directions is the round button). Before leaving and on the way, the Next line is words only and one row
    /// holds Start (owner, 2026-10-20: "not every tech is going to use every function all the
    /// time"; "Change 'start job' to 'start'") with Message (the On My Way text when it's the
    /// tech's to send; no car, owner 2026-10-20), Call and Directions after it. On site the round
    /// buttons sit on the Next line, then Open Checklist with Mark Complete; a finished stop has
    /// only its undo. Swipe the card, or tap a segment, to look at another stop; Back to Now
    /// returns (docs/design/2026-10-20-gestures.md). Owners and admins looking at a tech's day get
    /// Message (blank), Call and Directions only. Website components/today-hero.tsx. A solid card in the content layer, never glass.
    struct TodayHeroCard: View {
        var hero: TodayHero
        var day: TodayDay
        /// Do Later and its Undo (docs/plans/today-reorder.md).
        var moves: StopMoves? = nil
        /// The stop just completed, drawn done with its check for a moment before the card moves
        /// on (owner, 2026-10-20: gestures spec section 9). No Back to Now then.
        var flashing = false
        /// Go to a stop (its index in the day): a tapped segment, VoiceOver's swipe up or down.
        var go: (Int) -> Void = { _ in }
        /// Back to the stop the day is on.
        var backToNow: () -> Void = {}
        @Environment(AppEnvironment.self) private var app
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.openRoute) private var openRoute
        @Environment(\.openURL) private var openURL
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        @Environment(\.dynamicTypeSize) private var typeSize
        @State private var startError: String?
        @State private var started = 0
        @State private var width: CGFloat = 400
        /// Message's On My Way compose sheet (from the company number).
        @State private var composing: ScheduleJob?
        /// A text from the phone, addressed to the stop's customer (`StopText`).
        @State private var phoneText: ComposeText?

        /// Secondary text on the card: white at 92% is 4.8:1 on water blue (85% was 4.3:1).
        static let soft = Color.white.opacity(0.92)

        /// The stop on the card (none when the day is done).
        private var job: ScheduleJob? { hero.stopId.flatMap { id in day.route?.jobs.first { $0.id == id } } }

        /// Who the buttons are for: always the card's own stop (owner, 2026-10-20: the card is
        /// about one stop, and its buttons are for that stop).
        private var target: ScheduleJob? { job }

        /// Message, Call and Directions, for a stop not done yet.
        private var contact: ScheduleJob? { hero.moment == .done ? nil : job }

        /// A finished stop's one button: Reopen Visit or Mark Not Complete, where Today's row
        /// offers it.
        private var undoJob: ScheduleJob? {
            guard heroActions(hero.moment, mine: day.mine).undo, let job,
                todayUndo(job, day: day.ctx.today) != nil
            else { return nil }
            return job
        }

        var body: some View {
            let c = hero.content
            let actions = heroActions(hero.moment, mine: day.mine)
            let hasButtons =
                (actions.primary != nil && target != nil) || (actions.complete && job != nil) || undoJob != nil
            // Before leaving and on the way, Start leads one row with the round buttons after it
            // (owner, 2026-10-20: "Place 'Start Job' to the left of the three icons. Just to
            // condense space"); the Next line is then words only.
            let startRow = actions.primary == .startJob && target != nil
            VStack(alignment: .leading, spacing: 0) {
                top(c)
                    .accessibilitySortPriority(4)
                if let job, hero.moment != .done {
                    details(job, c).padding(.top, 12)
                }
                if startRow {
                    if let next = c.next {
                        nextText(next).padding(.top, 12)
                    }
                    if let target {
                        startLine(target, onMyWay: actions.onMyWay)
                            .padding(.top, 16)
                            .accessibilitySortPriority(3)
                    }
                } else {
                    if c.next != nil || contact != nil {
                        nextLine(c).padding(.top, 12)
                    }
                    if hasButtons {
                        buttons(actions)
                            .padding(.top, 16)
                            .accessibilitySortPriority(3)
                    }
                }
                if moves?.shown(for: .card) != nil || laterJob != nil {
                    laterRow
                        .padding(.top, 12)
                        .accessibilitySortPriority(2)
                }
                progress
                    .padding(.top, 16)
                    .accessibilitySortPriority(0)
            }
            .padding(width < 375 ? 16 : 20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.water, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .onGeometryChange(for: CGFloat.self) {
                $0.size.width
            } action: {
                width = $0
            }
            .overlay {
                // The stop just completed: its check, for a moment (none with Reduce Motion).
                if flashing {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 64, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .transition(.scale(scale: 0.6).combined(with: .opacity))
                        .accessibilityHidden(true)
                }
            }
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: hero.moment)
            .animation(reduceMotion ? nil : .spring(duration: 0.3), value: flashing)
            .sensoryFeedback(.success, trigger: started)
            .accessibilityElement(children: .contain)
            .sheet(item: $composing) { job in
                OnMyWaySheet(job: job, day: day, leg: day.leg(job))
            }
            .composeTextSheet($phoneText)
        }

        /// Do Later on the card's stop, Up next and On the way (docs/plans/today-reorder.md): the
        /// stop can move and isn't last already.
        private var laterJob: ScheduleJob? {
            guard moves != nil, hero.moment == .ahead || hero.moment == .driving, let job,
                day.canPlace(job, .later)
            else { return nil }
            return job
        }

        /// Do Later on its own row under the card's buttons; for 5 seconds after it, "Moved." and
        /// Undo in its place (the website's and Android's card do the same).
        @ViewBuilder private var laterRow: some View {
            if let moves, let undo = moves.shown(for: .card) {
                HStack(spacing: 8) {
                    Text(undo.text)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.white)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(TodayReorderText.undo) { moves.undoMove(undo) }
                        .buttonStyle(HeroButtonStyle(filled: false))
                        .fixedSize()
                        .accessibilityHint("Puts it back as it was")
                        .onAppear {
                            AccessibilityNotification.Announcement(
                                "\(undo.text). \(TodayReorderText.undo) available."
                            ).post()
                        }
                    Spacer(minLength: 0)
                }
            } else if let moves, let later = laterJob {
                HStack(spacing: 8) {
                    Button(TodayReorderText.doLater) { moves.doLater(later, .card) }
                        .buttonStyle(HeroButtonStyle(filled: false))
                        .fixedSize()
                        .accessibilityLabel("\(TodayReorderText.doLater), \(later.customerName)")
                        .accessibilityHint("Moves the stop after the last one")
                    Spacer(minLength: 0)
                }
            }
        }

        /// "At the pool · Stop 2 of 3", the name (it opens the job), the type and the drive, and
        /// the figure top right; one column at the accessibility text sizes. Read as one item:
        /// the Live Activity's sentence, with Open Job as its action.
        private func top(_ c: LiveStopContent) -> some View {
            let words = VStack(alignment: .leading, spacing: 2) {
                // The stop's place once (owner, 2026-10-20: no clock times; core `heroTopLine`).
                Text(heroTopLine(hero))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Self.soft)
                if let job {
                    Button {
                        openRoute(.job(job.id))
                    } label: {
                        Text(job.customerName)
                            .font(LiveStopStyle.display(28, .extraBold))
                            .foregroundStyle(Color.white)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                            .frame(minHeight: minTarget, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    let kind = [jobTypeLabel(job.type), heroDrive(hero.moment, day.leg(job))]
                        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                    if !kind.isEmpty {
                        Text(kind)
                            .font(.subheadline)
                            .foregroundStyle(Self.soft)
                    }
                }
            }
            // The words cross-fade when the moment changes (none with Reduce Motion).
            .id(hero.moment)
            .transition(.opacity)
            .frame(maxWidth: .infinity, alignment: .leading)
            let stacked = typeSize >= .accessibility1
            let layout =
                stacked
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
                : AnyLayout(
                    HStackLayout(alignment: .top, spacing: 16))
            return layout {
                words
                if hero.browsing && !flashing {
                    backToNowButton
                } else {
                    figure(c, alignment: stacked ? .leading : .trailing)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(c.spoken)
            .accessibilityValue(spokenStop)
            .accessibilityAddTraits(.isHeader)
            // Swipe up or down to change the stop (gestures spec section 1).
            .accessibilityAdjustableAction { direction in
                let at = hero.stopId.flatMap { id in day.heroStops.firstIndex { $0.id == id } } ?? day.heroStops.count
                switch direction {
                case .increment: if at + 1 < day.heroStops.count { go(at + 1) }
                case .decrement: if at > 0 { go(at - 1) }
                @unknown default: break
                }
            }
            .accessibilityActions {
                if let job { Button("Open Job") { openRoute(.job(job.id)) } }
                if hero.browsing { Button(Self.backToNowTitle, action: backToNow) }
            }
        }

        static let backToNowTitle = "Back to Now"

        /// "Stop 2 of 3, Derek Jeter", what VoiceOver reads as the card's value.
        private var spokenStop: String {
            guard let job else { return heroHeadline(hero) }
            return "Stop \(hero.stop) of \(hero.stops), \(job.customerName)"
        }

        /// Back to Now, in the figure's place while the card shows a stop the tech picked: white
        /// at 18%, 15 pt semibold, 44 pt tall.
        private var backToNowButton: some View {
            Button(action: backToNow) {
                Text(Self.backToNowTitle)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.white)
                    .lineLimit(1)
                    .padding(.horizontal, 14)
                    .frame(minHeight: minTarget)
                    .background(Capsule().fill(Color.white.opacity(0.18)))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .fixedSize()
        }

        /// "0 of 8" over "Checklist": 22 pt semibold, tabular, rolling to its new value.
        private func figure(_ c: LiveStopContent, alignment: HorizontalAlignment) -> some View {
            VStack(alignment: alignment, spacing: 4) {
                if c.figure == "✓" {
                    Image(systemName: "checkmark")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(Color.white)
                } else {
                    Text(c.figure)
                        .font(.system(size: 22, weight: .semibold, design: .default))
                        .monospacedDigit()
                        .foregroundStyle(Color.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .contentTransition(reduceMotion ? .identity : .numericText())
                        .animation(reduceMotion ? nil : .snappy(duration: 0.3), value: c.figure)
                }
                if !c.figureLabel.isEmpty {
                    Text(c.figureLabel)
                        .font(.footnote)
                        .foregroundStyle(Self.soft)
                }
            }
            .fixedSize(horizontal: typeSize < .accessibility1, vertical: false)
        }

        /// The address (plain text) with the warning symbol after it when it wasn't found
        /// on the map, the access notes, and the customer's and pool's notes, each after a 15 pt
        /// symbol in a 20 pt column so the text lines up.
        private func details(_ job: ScheduleJob, _ c: LiveStopContent) -> some View {
            VStack(alignment: .leading, spacing: 6) {
                if !job.address.isEmpty {
                    // Plain text, not a link (owner, 2026-10-20: "The address should no longer be
                    // clickable on this [tile]"): Directions is the round button. Left out of
                    // drive times until its address is found: just the symbol (owner, 2026-10-20:
                    // "Don't waste space with text").
                    let missing = day.routing && job.mapMissing
                    detail("mappin.and.ellipse") {
                        (Text(job.address) + (missing ? NotOnMapTag.text(color: .white) : Text("")))
                            .textRole(.body)
                            .fontWeight(.medium)
                            .foregroundStyle(Color.white)
                            .multilineTextAlignment(.leading)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(job.address)\(missing ? ", \(NotOnMap.title.lowercased())" : "")")
                    .accessibilitySortPriority(1)
                }
                // Already in the card's sentence for VoiceOver.
                if let access = c.access {
                    detail("key.fill") {
                        Text(access).font(.subheadline).foregroundStyle(Color.white)
                    }
                    .accessibilityHidden(true)
                }
                // The cleanings due on this visit, soonest first (owner, 2026-10-20: "The
                // filter/salt cell cleaning alert needs to be on the new Today tile and the live
                // activity"); none on a done card (core `liveStopContent` leaves them out).
                if let first = c.cleanings.first, hero.moment != .done, hero.moment != .dayDone {
                    HStack(alignment: .center, spacing: 8) {
                        // The first cleaning's icon sits in the symbol column.
                        CleaningIcon(kind: first.kind, size: 18)
                            .foregroundStyle(Color.white)
                            .frame(width: 20)
                        FlowRow(spacing: 12) {
                            ForEach(Array(c.cleanings.enumerated()), id: \.offset) { index, badge in
                                HeroCleaningBadge(badge: badge, icon: index > 0)
                            }
                        }
                    }
                }
                // The customer's notes, then the pool's (owner, 2026-10-20: "you have to have
                // customer notes there"), two lines at most; the job has the rest.
                if let notes = job.notes {
                    detail("note.text") {
                        Text(notes).font(.subheadline).foregroundStyle(Color.white).lineLimit(2)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Notes: \(notes)")
                    .accessibilitySortPriority(1)
                }
            }
        }

        /// One cleaning: its icon (the first one's sits in the symbol column) and a few words,
        /// 15 pt medium white; overdue is a white pill with water-blue text, so it stands out
        /// without a new color. VoiceOver reads it in full ("Clean filter due in 3 days").
        private struct HeroCleaningBadge: View {
            var badge: CleaningBadge
            var icon: Bool

            var body: some View {
                HStack(spacing: 4) {
                    if icon { CleaningIcon(kind: badge.kind, size: 18) }
                    Text(badge.label)
                        .font(.subheadline.weight(badge.overdue ? .semibold : .medium))
                        .lineLimit(1)
                        .padding(.horizontal, badge.overdue ? 8 : 0)
                        .padding(.vertical, badge.overdue ? 2 : 0)
                        .foregroundStyle(badge.overdue ? Color.water : Color.white)
                        .background {
                            if badge.overdue { Capsule().fill(Color.white) }
                        }
                }
                .foregroundStyle(Color.white)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(badge.spoken)
            }
        }

        private func detail(_ symbol: String, @ViewBuilder _ text: () -> some View) -> some View {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: symbol)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: 20)
                    .accessibilityHidden(true)
                text()
            }
        }

        /// "Next: Wayne Gretzky at 9:15 AM", then On My Way, Message, Call and Directions, 44 pt circles
        /// right-aligned (alone at the right when there's no next stop).
        private func nextLine(_ c: LiveStopContent) -> some View {
            HStack(alignment: .center, spacing: 12) {
                if let next = c.next {
                    nextText(next)
                } else {
                    Spacer(minLength: 0)
                }
                if let contact {
                    contactButtons(contact, onMyWay: heroActions(hero.moment, mine: day.mine).onMyWay)
                        .accessibilitySortPriority(1)
                }
            }
        }

        private func nextText(_ next: String) -> some View {
            Text(next)
                .font(.subheadline)
                .foregroundStyle(Self.soft)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilitySortPriority(2)
        }

        /// Start, taking the rest of the row (110 pt at least), then the round buttons. When
        /// they don't fit beside it (accessibility text sizes, the narrowest phones), Start gets
        /// its own row and the round buttons sit under it, right-aligned.
        private func startLine(_ target: ScheduleJob, onMyWay: Bool) -> some View {
            let rounds = contact.map { roundCount($0, onMyWay: onMyWay) } ?? 0
            let inner = width - 2 * (width < 375 ? 16 : 20)
            let needed: CGFloat = 110 + (rounds > 0 ? 10 + CGFloat(rounds) * minTarget + CGFloat(rounds - 1) * 8 : 0)
            let fits = typeSize < .accessibility1 && needed <= inner
            let layout =
                fits
                ? AnyLayout(HStackLayout(alignment: .center, spacing: 10))
                : AnyLayout(VStackLayout(alignment: .trailing, spacing: 10))
            return VStack(alignment: .leading, spacing: 6) {
                layout {
                    startButton(target).frame(minWidth: 110, maxWidth: .infinity)
                    if let contact {
                        contactButtons(contact, onMyWay: onMyWay)
                            .accessibilitySortPriority(-1)
                    }
                }
                if let startError {
                    Text(startError)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.white)
                }
            }
        }

        /// How many round buttons `contactButtons` draws.
        private func roundCount(_ job: ScheduleJob, onMyWay: Bool) -> Int {
            (job.customerPhone != nil ? 2 : 0) + (job.address.isEmpty ? 0 : 1)
        }

        private func startButton(_ target: ScheduleJob) -> some View {
            Button(HeroAction.startJob.label) { start(target) }
                .buttonStyle(HeroButtonStyle(filled: true))
                .accessibilityLabel("Start \(target.customerName)")
        }

        /// Message, Call and Directions (owner, 2026-10-20: no car; On My Way lives in Message).
        private func contactButtons(_ job: ScheduleJob, onMyWay: Bool) -> some View {
            HStack(spacing: 8) {
                if let phone = job.customerPhone {
                    HeroRoundButton(
                        systemImage: "message.fill",
                        label: onMyWay ? "Text \(job.customerName) On My Way" : "Text \(job.customerName)"
                    ) {
                        if onMyWay { onMyWayText(job, phone: phone) } else { text(job, phone: phone) }
                    }
                    HeroRoundButton(systemImage: "phone.fill", label: "Call \(job.customerName)") {
                        if let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") { openURL(url) }
                    }
                }
                if !job.address.isEmpty {
                    HeroRoundButton(systemImage: "location.fill", label: "Directions to \(job.customerName)") {
                        if let url = directionsURL(job.place, app: MapsApp(sync.kv)) { openURL(url) }
                    }
                }
            }
            .fixedSize()
        }

        /// Message on the tech's own stop before they arrive, On My Way not sent today (gestures
        /// spec section 2): the text already filled in with the On My Way message, editable. From
        /// the company number, the in-app compose sheet; otherwise the phone's Messages with the
        /// text in it, recorded when opened, as the old fallback did.
        private func onMyWayText(_ job: ScheduleJob, phone: String) {
            if OnMyWay.viaCompany(job, day: day) {
                composing = job
                return
            }
            let leg = day.leg(job)
            OnMyWay.record(job, day: day, leg: leg, session: session, app: app)
            StopText.open(
                .phone(StopTextRoute.smsNumber(phone)), body: OnMyWay.text(job, day: day, leg: leg),
                openRoute: openRoute, openURL: openURL
            ) { phoneText = $0 }
        }

        /// A blank text to the card's customer, whoever's day it is (owner, 2026-10-21: an owner on
        /// a tech's day landed in Messages, not on the customer): from the company number when
        /// the shop has one working (their conversation, or New Message to them), else a text from
        /// the phone addressed to them (`StopTextRoute`).
        private func text(_ job: ScheduleJob, phone: String) {
            guard let company = session.company else { return }
            let lineActive = companyLine(sync.store, companyId: company.id)?.status == "active"
            guard
                let route = StopTextRoute.decide(
                    lineActive: lineActive, customerId: job.customerId, phone: phone,
                    conversations: lineActive ? conversations(sync.store, companyId: company.id) : [])
            else { return }
            StopText.open(route, openRoute: openRoute, openURL: openURL) { phoneText = $0 }
        }

        /// One row, equal widths, 50 pt capsules: style, not size, marks the main action (white
        /// with water-blue text); Mark Complete beside it is white at 18%. One button fills the row.
        private func buttons(_ actions: HeroActions) -> some View {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 10) {
                    if let primary = actions.primary, let target {
                        primaryButton(primary, target).frame(maxWidth: .infinity)
                    }
                    if actions.complete || undoJob != nil, let job {
                        TodayMarkButton(job: job, day: day, onCard: true).frame(maxWidth: .infinity)
                    }
                }
                if let startError {
                    Text(startError)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.white)
                }
            }
        }

        @ViewBuilder private func primaryButton(_ action: HeroAction, _ target: ScheduleJob) -> some View {
            switch action {
            case .onMyWay:
                // Never the main button: On My Way lives in Message (`heroActions`).
                EmptyView()
            case .startJob:
                startButton(target)
            case .openChecklist:
                Button(HeroAction.openChecklist.label) { openRoute(.jobSection(target.id, .checklist)) }
                    .buttonStyle(HeroButtonStyle(filled: true))
            }
        }

        /// Start, through the sync layer (the job page's own write), with a light tap.
        private func start(_ job: ScheduleJob) {
            guard let company = session.company else { return }
            do {
                guard let row = try sync.store.get("job", job.id) else { return }
                try sync.write("job", id: job.id, companyId: company.id, jobStatusValues(.inProgress, job: row))
                startError = nil
                started += 1
            } catch {
                startError = String(describing: error)
            }
        }

        /// One segment per stop, 4 pt tall and 4 apart: done white, this one white at 70%, still
        /// to come white at 28%. Each is a button to its stop, with a 44 pt tall tap area (the bar
        /// keeps its 4 pt look).
        private var progress: some View {
            HStack(spacing: 4) {
                ForEach(Array(hero.segments.enumerated()), id: \.offset) { index, segment in
                    Button {
                        go(index)
                    } label: {
                        Capsule()
                            .fill(
                                segment == .done
                                    ? Color.white : segment == .current ? Color.white.opacity(0.7) : LiveStopStyle.track
                            )
                            .frame(height: 4)
                            .frame(maxWidth: .infinity, minHeight: minTarget)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHidden(true)
                }
            }
            .padding(.vertical, -(minTarget - 4) / 2)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(heroSegmentsSpoken(doneCount: hero.doneCount, stops: hero.stops))
        }
    }

    /// The card's buttons, filling their share of the row: filled, white with water-blue text
    /// (the main one); otherwise white at 18% behind white text. 50 pt capsules that press in to
    /// 0.96 and 85% (none with Reduce Motion).
    struct HeroButtonStyle: ButtonStyle {
        var filled: Bool
        @Environment(\.isEnabled) private var isEnabled
        @Environment(\.heroSwiping) private var swiping

        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .font(.role(.bodyEmphasis))
                .lineLimit(2)
                .minimumScaleFactor(0.85)
                .multilineTextAlignment(.center)
                .foregroundStyle(filled ? Color.water : Color.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(Capsule().fill(filled ? Color.white : Color.white.opacity(0.18)))
                .contentShape(Capsule())
                .opacity(configuration.isPressed ? 0.85 : 1)
                .scaleEffect(configuration.isPressed && !Motion.reduced ? 0.96 : 1)
                .animation(Motion.snappy, value: configuration.isPressed)
                // Turned off while the card is swiped, not dimmed.
                .opacity(isEnabled || swiping ? 1 : 0.6)
        }
    }

    /// A round contact action on the card: 44 pt, white at 18% behind a white 20 pt symbol.
    struct HeroRoundButton: View {
        var systemImage: String
        var label: String
        var action: () -> Void

        var body: some View {
            Button(action: action) {
                Image(systemName: systemImage)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .frame(width: minTarget, height: minTarget)
                    .background(Circle().fill(Color.white.opacity(0.18)))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
        }
    }

    /// Today's done stops folded into one row, "3 done", that opens to show them (owner,
    /// 2026-10-20): the first row of the day's block, the check in the stop number's column.
    /// Website today/page.tsx `today-done`.
    struct TodayDoneRow: View {
        var count: Int
        @Binding var open: Bool
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        var body: some View {
            Button {
                withAnimation(reduceMotion ? nil : .snappy(duration: 0.25)) { open.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Color.pass)
                        .frame(width: 32)
                        .accessibilityHidden(true)
                    Text("\(count) done")
                        .textRole(.bodyEmphasis)
                        .foregroundStyle(Color.textMuted)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Color.textMuted)
                        .rotationEffect(.degrees(open ? 90 : 0))
                        .accessibilityHidden(true)
                }
                .padding(.leading, 12)
                .padding(.trailing, 16)
                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(count) done")
            .accessibilityValue(open ? "Expanded" : "Collapsed")
            .accessibilityHint(open ? "Hides the done stops" : "Shows the done stops")
        }
    }

    /// "Now" on the list's row for the card's stop.
    struct NowPill: View {
        var body: some View {
            Text("Now")
                .font(.role(.footnote).weight(.semibold))
                .foregroundStyle(Color.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 2)
                .background(Capsule().fill(Color.water))
        }
    }
#endif

#if os(iOS)
    import SundeckCore
    import SwiftUI
    import UIKit

    /// Today's card, browsable (owner, 2026-10-20: "a better way to move the hero tile on Today
    /// back to a previous job"; docs/design/2026-10-20-gestures.md section 1): swipe it left for the
    /// next stop and right for the one before. It follows the finger, then settles on the stop with
    /// a spring (0.35 s); past the first or last stop it resists and springs back. Only a sideways
    /// drag moves it, so a vertical drag still scrolls Today. Tapped segments, Back to Now,
    /// VoiceOver's swipe up or down and Mark Complete (which moves on to the next stop) slide it
    /// the same way. With Reduce Motion the stop cross-fades instead. What's on the card is local
    /// state: no round trip, nothing read from the database.
    extension EnvironmentValues {
        /// Today's card is being swiped: its buttons are off without looking dimmed.
        @Entry var heroSwiping = false
    }

    struct TodayHeroPager: View {
        var day: TodayDay
        /// The stop the tech picked (nil: the one the day is on).
        @Binding var viewing: String?
        /// The stop just completed, shown done with its check for a moment (gestures section 9).
        var flash: String?
        /// Do Later and its Undo on the card (docs/plans/today-reorder.md).
        var moves: StopMoves? = nil
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        /// The stop drawn now: follows `flash ?? viewing` after the slide.
        @State private var shown: String?
        @State private var drag: CGFloat = 0
        @State private var width: CGFloat = 360
        @State private var turns = 0
        /// A sideways drag is on: the card's buttons and its name don't take the lift of the
        /// finger as a tap (owner, 2026-10-20: "When you swipe on the hero tile, it also opens
        /// that job's page"). Back on shortly after the drag ends.
        @State private var swiping = false

        private var ids: [String] { day.heroStops.map(\.id) }

        var body: some View {
            // The stop just completed shows at once (the day has already moved on under it).
            if let hero = day.hero(viewing: flash ?? shown) {
                let at = hero.stopId.flatMap { ids.firstIndex(of: $0) }
                TodayHeroCard(
                    hero: hero, day: day, moves: moves, flashing: flash != nil,
                    go: { pick($0) }, backToNow: { viewing = nil }
                )
                .disabled(swiping)
                .environment(\.heroSwiping, swiping)
                .id(reduceMotion ? (hero.stopId ?? "day") : "card")
                .transition(.opacity)
                .offset(x: drag)
                .onGeometryChange(for: CGFloat.self) {
                    $0.size.width
                } action: {
                    width = $0
                }
                .contentShape(Rectangle())
                // A UIKit pan that begins only on a clearly sideways drag, so a vertical drag
                // that starts on the card always scrolls Today (owner, 2026-10-21).
                .gesture(
                    HeroPan(
                        changed: { dragChanged($0, at: at) },
                        ended: { dragEnded($0, velocity: $1, at: at) })
                )
                .sensoryFeedback(.selection, trigger: turns)
                .onAppear { shown = flash ?? viewing }
                .onChange(of: flash ?? viewing) { _, target in move(to: target) }
            }
        }

        /// Go to the stop at `index` (a segment, VoiceOver): the stop the day is on is "now".
        private func pick(_ index: Int) {
            guard ids.indices.contains(index) else { return }
            let id = ids[index]
            viewing = id == day.hero()?.currentId ? nil : id
        }

        /// Where the card's next and previous stops are, from the stop at `at`.
        private func neighbors(_ at: Int?) -> (index: Int, hasNext: Bool, hasPrevious: Bool) {
            // From the day-done card, the stop before is the last one.
            let index = at ?? ids.count
            return (index, index + 1 < ids.count, index > 0)
        }

        private func dragChanged(_ translation: CGSize, at: Int?) {
            if !swiping { swiping = true }
            guard flash == nil else { return }
            let n = neighbors(at)
            let dx = translation.width
            let free = dx < 0 ? n.hasNext : n.hasPrevious
            // Past the first or last stop it resists.
            drag = free ? dx : dx / (1 + abs(dx) / 80) * 0.6
        }

        private func dragEnded(_ translation: CGSize, velocity: CGSize, at: Int?) {
            defer {
                // After the lift's tap would have landed.
                if swiping {
                    Task {
                        try? await Task.sleep(for: .milliseconds(300))
                        swiping = false
                    }
                }
            }
            guard flash == nil else { return }
            let n = neighbors(at)
            let dx = translation.width
            let flick = abs(velocity.width) >= PagerRule.flickSpeed && abs(dx) >= PagerRule.flickDistance
            if (dx < -60 || (flick && velocity.width < 0)) && n.hasNext {
                pick(n.index + 1)
            } else if (dx > 60 || (flick && velocity.width > 0)) && n.hasPrevious {
                pick(n.index - 1)
            } else {
                withAnimation(.spring(duration: 0.35)) { drag = 0 }
            }
        }

        /// Slides to `target`'s stop: the card leaves the way it's going and the new stop comes in
        /// from the other side; a cross-fade with Reduce Motion; no motion for the same stop.
        private func move(to target: String?) {
            let from = day.hero(viewing: shown)?.stopId
            let to = day.hero(viewing: target)?.stopId
            // The stop just completed stays where it was, drawn done with its check; the slide
            // comes when the check is over.
            guard from != to, target != flash || flash == nil else {
                shown = target
                return
            }
            turns += 1
            if reduceMotion {
                withAnimation(.easeInOut(duration: 0.25)) {
                    shown = target
                    drag = 0
                }
                return
            }
            let index = { (id: String?) in id.flatMap { ids.firstIndex(of: $0) } ?? ids.count }
            let forward = index(to) > index(from)
            let out = (forward ? -1 : 1) * (width + 24)
            withAnimation(.easeIn(duration: 0.14)) {
                drag = out
            } completion: {
                var t = Transaction()
                t.disablesAnimations = true
                withTransaction(t) {
                    shown = target
                    drag = -out
                }
                withAnimation(.spring(duration: 0.35, bounce: 0.12)) { drag = 0 }
            }
        }
    }

    /// Today's card's sideways drag as a UIKit pan (owner, 2026-10-21: vertical scrolling that
    /// started on the card was sometimes blocked). It begins only when `PagerRule.heroClaims`
    /// says the drag is clearly sideways; otherwise it fails at once and the scroll view has the
    /// drag. A SwiftUI DragGesture on a scroll view's content can hold the scroll back.
    struct HeroPan: UIGestureRecognizerRepresentable {
        var changed: (CGSize) -> Void
        var ended: (CGSize, CGSize) -> Void

        func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
            let pan = UIPanGestureRecognizer()
            pan.delegate = context.coordinator
            pan.maximumNumberOfTouches = 1
            return pan
        }

        func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

        func handleUIGestureRecognizerAction(_ recognizer: UIPanGestureRecognizer, context: Context) {
            let t = recognizer.translation(in: recognizer.view)
            let translation = CGSize(width: t.x, height: t.y)
            switch recognizer.state {
            case .began, .changed: changed(translation)
            case .ended:
                let v = recognizer.velocity(in: recognizer.view)
                ended(translation, CGSize(width: v.x, height: v.y))
            case .cancelled, .failed: ended(.zero, .zero)
            default: break
            }
        }

        @MainActor final class Coordinator: NSObject, UIGestureRecognizerDelegate {
            func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
                guard let pan = recognizer as? UIPanGestureRecognizer else { return false }
                let t = pan.translation(in: pan.view)
                let v = pan.velocity(in: pan.view)
                return PagerRule.heroClaims(CGSize(width: t.x, height: t.y), velocity: CGSize(width: v.x, height: v.y))
            }

            /// The page's scroll keeps its own pan; a sideways drag barely moves it up or down.
            func gestureRecognizer(
                _ recognizer: UIGestureRecognizer,
                shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
            ) -> Bool {
                true
            }
        }
    }
#endif
