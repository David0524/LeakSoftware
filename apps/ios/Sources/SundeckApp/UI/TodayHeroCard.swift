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
    /// opens directions. Before leaving and on the way, the Next line is words only and one row
    /// holds Start (owner, 2026-10-20: "not every tech is going to use every function all the
    /// time"; "Change 'start job' to 'start'") with On My Way (a round car, when it's the tech's
    /// to send), Message, Call and Directions after it. On site the round buttons sit on the Next
    /// line, then Open Checklist with Mark Complete. Owners and admins looking at a tech's day get
    /// Message, Call and Directions only. Website components/today-hero.tsx. A solid card in the content layer, never glass.
    struct TodayHeroCard: View {
        var hero: TodayHero
        var day: TodayDay
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.openRoute) private var openRoute
        @Environment(\.openURL) private var openURL
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        @Environment(\.dynamicTypeSize) private var typeSize
        @State private var startError: String?
        @State private var started = 0
        @State private var width: CGFloat = 400

        /// Secondary text on the card: white at 92% is 4.8:1 on water blue (85% was 4.3:1).
        static let soft = Color.white.opacity(0.92)

        /// The stop on the card (none when the day is done).
        private var job: ScheduleJob? { hero.stopId.flatMap { id in day.route?.jobs.first { $0.id == id } } }

        /// Who the buttons are for: the card's stop, or the next one when it just finished.
        private var target: ScheduleJob? {
            guard hero.moment == .done else { return job }
            return day.route?.jobs.first { !$0.doneOn(day.ctx.today) }
        }

        /// Message, Call and Directions are for the stop being worked, not the next one.
        private var contact: ScheduleJob? { hero.moment == .done ? nil : target }

        var body: some View {
            let c = hero.content
            let actions = heroActions(hero.moment, mine: day.mine)
            let hasButtons = (actions.primary != nil && target != nil) || (actions.complete && job != nil)
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
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: hero.moment)
            .sensoryFeedback(.success, trigger: started)
            .accessibilityElement(children: .contain)
        }

        /// "At the pool · Stop 2 of 3", the name (it opens the job), the type and the drive, and
        /// the figure top right; one column at the accessibility text sizes. Read as one item:
        /// the Live Activity's sentence, with Open Job as its action.
        private func top(_ c: LiveStopContent) -> some View {
            let words = VStack(alignment: .leading, spacing: 2) {
                Text(
                    hero.moment == .dayDone
                        ? heroHeadline(hero) : "\(heroHeadline(hero)) · Stop \(hero.stop) of \(hero.stops)"
                )
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
                figure(c, alignment: stacked ? .leading : .trailing)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(c.spoken)
            .accessibilityAddTraits(.isHeader)
            .accessibilityActions {
                if let job { Button("Open Job") { openRoute(.job(job.id)) } }
            }
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

        /// The address (it opens directions) with the warning symbol after it when it wasn't found
        /// on the map, the access notes, and the customer's and pool's notes, each after a 15 pt
        /// symbol in a 20 pt column so the text lines up.
        private func details(_ job: ScheduleJob, _ c: LiveStopContent) -> some View {
            VStack(alignment: .leading, spacing: 6) {
                if !job.address.isEmpty {
                    Button {
                        if let url = directionsURL(job.place, app: MapsApp(sync.kv)) { openURL(url) }
                    } label: {
                        // Left out of drive times until its address is found: just the symbol
                        // (owner, 2026-10-20: "Don't waste space with text").
                        let missing = day.routing && job.mapMissing
                        detail("mappin.and.ellipse") {
                            (Text(job.address) + (missing ? NotOnMapTag.text(color: .white) : Text("")))
                                .textRole(.body)
                                .fontWeight(.medium)
                                .foregroundStyle(Color.white)
                                .multilineTextAlignment(.leading)
                        }
                        .frame(minHeight: minTarget, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(
                        "\(job.address)\(day.routing && job.mapMissing ? ", \(NotOnMap.title.lowercased())" : ""), directions in Maps"
                    )
                    .accessibilitySortPriority(1)
                }
                // Already in the card's sentence for VoiceOver.
                if let access = c.access {
                    detail("key.fill") {
                        Text(access).font(.subheadline).foregroundStyle(Color.white)
                    }
                    .accessibilityHidden(true)
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
            (onMyWay ? 1 : 0) + (job.customerPhone != nil ? 2 : 0) + (job.address.isEmpty ? 0 : 1)
        }

        private func startButton(_ target: ScheduleJob) -> some View {
            Button(HeroAction.startJob.label) { start(target) }
                .buttonStyle(HeroButtonStyle(filled: true))
                .accessibilityLabel("Start \(target.customerName)")
        }

        /// On My Way first (when it's the tech's to send), then Message, Call and Directions.
        private func contactButtons(_ job: ScheduleJob, onMyWay: Bool) -> some View {
            HStack(spacing: 8) {
                if onMyWay { OnMyWayButton(job: job, day: day, leg: day.leg(job), onCard: true) }
                if let phone = job.customerPhone {
                    HeroRoundButton(systemImage: "message.fill", label: "Text \(job.customerName)") {
                        text(job, phone: phone)
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

        /// Texts the customer from the company number when the shop has one working (their
        /// conversation, or New Message to them), else from the phone's own Messages app, as the
        /// job page's Text button does.
        private func text(_ job: ScheduleJob, phone: String) {
            guard let company = session.company,
                companyLine(sync.store, companyId: company.id)?.status == "active",
                let customerId = job.customerId
            else {
                if let url = URL(string: "sms:\(phone.filter { $0.isNumber || $0 == "+" })") { openURL(url) }
                return
            }
            if let thread = conversations(sync.store, companyId: company.id).first(where: {
                $0.customerId == customerId
            }) {
                openRoute(.messages(.conversation(thread.id)))
            } else {
                openRoute(.messages(.newMessage(customerId: customerId)))
            }
        }

        /// One row, equal widths, 50 pt capsules: style, not size, marks the main action (white
        /// with water-blue text); Mark Complete beside it is white at 18%. One button fills the row.
        private func buttons(_ actions: HeroActions) -> some View {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 10) {
                    if let primary = actions.primary, let target {
                        primaryButton(primary, target).frame(maxWidth: .infinity)
                    }
                    if actions.complete, let job {
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
                // Never the main button any more: a round car on the Next line (`heroActions`).
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
        /// to come white at 28%.
        private var progress: some View {
            HStack(spacing: 4) {
                ForEach(Array(hero.segments.enumerated()), id: \.offset) { _, segment in
                    Capsule()
                        .fill(
                            segment == .done
                                ? Color.white : segment == .current ? Color.white.opacity(0.7) : LiveStopStyle.track
                        )
                        .frame(height: 4)
                }
            }
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
                .opacity(isEnabled ? 1 : 0.6)
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
    /// 2026-10-20). Website today/page.tsx `today-done`.
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
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .card(padding: 0)
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
