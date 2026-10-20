#if os(iOS)
    import SundeckCore
    import SundeckLiveStop
    import SundeckSync
    import SundeckTokens
    import SwiftUI

    /// Today's card for the stop the tech is on (owner, 2026-10-20; docs/plans/today-hero.md):
    /// the Live Activity brought into the app, in its water blue, from the same rule (core
    /// `todayHero`), so the Lock Screen and the card always pick the same stop. The customer's
    /// name opens the job; the address opens directions; the main button is the moment's (On My
    /// Way, Start Job, Open Checklist with Mark Complete). Owners and admins looking at a tech's
    /// day get Call and Directions only. Website components/today-hero.tsx.
    struct TodayHeroCard: View {
        var hero: TodayHero
        var day: TodayDay
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(\.openRoute) private var openRoute
        @Environment(\.openURL) private var openURL
        @State private var startError: String?

        /// The stop on the card (none when the day is done).
        private var job: ScheduleJob? { hero.stopId.flatMap { id in day.route?.jobs.first { $0.id == id } } }

        /// Who the buttons are for: the card's stop, or the next one when it just finished.
        private var target: ScheduleJob? {
            guard hero.moment == .done else { return job }
            return day.route?.jobs.first { !$0.doneOn(day.ctx.today) }
        }

        var body: some View {
            let c = hero.content
            let actions = heroActions(hero.moment, mine: day.mine)
            VStack(alignment: .leading, spacing: 0) {
                top(c)
                if let job, hero.moment != .done { place(job, c) }
                if let next = c.next {
                    Text(next)
                        .font(LiveStopStyle.small())
                        .foregroundStyle(LiveStopStyle.muted)
                        .padding(.top, 8)
                }
                if target != nil || actions.complete { buttons(actions) }
                progress.padding(.top, 20)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.water, in: RoundedRectangle(cornerRadius: CGFloat(Radius.card), style: .continuous))
            .accessibilityElement(children: .contain)
        }

        /// The headline and the name (it opens the job), the job type and stop, and the figure.
        private func top(_ c: LiveStopContent) -> some View {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(c.headline)
                        .font(LiveStopStyle.small(.semibold))
                        .foregroundStyle(LiveStopStyle.muted)
                    if let job {
                        Button {
                            openRoute(.job(job.id))
                        } label: {
                            Text(job.customerName)
                                .font(LiveStopStyle.display(28, .extraBold))
                                .foregroundStyle(LiveStopStyle.text)
                                .multilineTextAlignment(.leading)
                                .frame(minHeight: minTarget, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    let subtitle = job.map {
                        heroSubtitle(jobTypeLabel($0.type), stop: hero.stop, stops: hero.stops, moment: hero.moment)
                    }
                    if let subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(LiveStopStyle.small())
                            .foregroundStyle(LiveStopStyle.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                LiveStopFigure(content: c, size: 36)
            }
            // Read as one item: the Live Activity's sentence; the name's link is an action.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(c.spoken)
            .accessibilityAddTraits(.isHeader)
            .accessibilityActions {
                if let job { Button("Open Job") { openRoute(.job(job.id)) } }
            }
        }

        /// The address (directions) and the drive before leaving, "Not found on the map", and the
        /// access notes on one line with a key.
        private func place(_ job: ScheduleJob, _ c: LiveStopContent) -> some View {
            VStack(alignment: .leading, spacing: 6) {
                if !job.address.isEmpty {
                    Button {
                        if let url = directionsURL(job.place, app: MapsApp(sync.kv)) { openURL(url) }
                    } label: {
                        (Text(job.address).underline(color: LiveStopStyle.muted).fontWeight(.medium)
                            + Text(heroDrive(hero.moment, day.leg(job)).map { " · \($0)" } ?? "")
                            .foregroundStyle(LiveStopStyle.muted))
                            .textRole(.body)
                            .foregroundStyle(LiveStopStyle.text)
                            .multilineTextAlignment(.leading)
                            .frame(minHeight: minTarget, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(
                        "\(job.address), directions in Maps"
                            + (heroDrive(hero.moment, day.leg(job)).map { ", \($0)" } ?? ""))
                }
                // Left out of drive times until its address is found (2026-10-20).
                if day.routing && job.mapMissing {
                    Label(NotOnMap.title, systemImage: "exclamationmark.triangle")
                        .font(LiveStopStyle.small(.semibold))
                        .foregroundStyle(LiveStopStyle.text)
                }
                // Already in the card's sentence for VoiceOver.
                if let access = c.access { LiveStopAccess(text: access) }
            }
            .padding(.top, 8)
        }

        /// The moment's main button (white on the water blue), Mark Complete at the pool, then
        /// round Call and Directions.
        private func buttons(_ actions: HeroActions) -> some View {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    if let primary = actions.primary, let target { primaryButton(primary, target) }
                    if actions.complete, let job { TodayMarkButton(job: job, day: day, onCard: true) }
                    Spacer(minLength: 0)
                    if let target, hero.moment != .done {
                        if let phone = target.customerPhone {
                            HeroRoundButton(systemImage: "phone.fill", label: "Call \(target.customerName), \(phone)") {
                                if let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                                    openURL(url)
                                }
                            }
                        }
                        if !target.address.isEmpty {
                            HeroRoundButton(systemImage: "location.fill", label: "Directions to \(target.customerName)")
                            {
                                if let url = directionsURL(target.place, app: MapsApp(sync.kv)) { openURL(url) }
                            }
                        }
                    }
                }
                if let startError {
                    Text(startError)
                        .font(LiveStopStyle.small(.semibold))
                        .foregroundStyle(LiveStopStyle.text)
                }
            }
            .padding(.top, 16)
        }

        @ViewBuilder private func primaryButton(_ action: HeroAction, _ target: ScheduleJob) -> some View {
            switch action {
            case .onMyWay:
                OnMyWayButton(job: target, day: day, leg: day.leg(target), onCard: true)
            case .startJob:
                Button(HeroAction.startJob.label) { start(target) }
                    .buttonStyle(HeroButtonStyle(filled: true))
                    .accessibilityLabel("Start Job for \(target.customerName)")
            case .openChecklist:
                Button(HeroAction.openChecklist.label) { openRoute(.jobSection(target.id, .checklist)) }
                    .buttonStyle(HeroButtonStyle(filled: true))
            }
        }

        /// Start Job, through the sync layer (the job page's own write).
        private func start(_ job: ScheduleJob) {
            guard let company = session.company else { return }
            do {
                guard let row = try sync.store.get("job", job.id) else { return }
                try sync.write("job", id: job.id, companyId: company.id, jobStatusValues(.inProgress, job: row))
                startError = nil
            } catch {
                startError = String(describing: error)
            }
        }

        /// One segment per stop: done, this one, still to come.
        private var progress: some View {
            HStack(spacing: 4) {
                ForEach(Array(hero.segments.enumerated()), id: \.offset) { _, segment in
                    Capsule()
                        .fill(
                            segment == .done
                                ? Color.white : segment == .current ? Color.white.opacity(0.7) : LiveStopStyle.track
                        )
                        .frame(height: 6)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(heroSegmentsSpoken(doneCount: hero.doneCount, stops: hero.stops))
        }
    }

    /// The card's buttons: filled, white with water-blue text (the main one); otherwise white at
    /// 18% behind white text. Pills at least 44 tall.
    struct HeroButtonStyle: ButtonStyle {
        var filled: Bool
        @Environment(\.isEnabled) private var isEnabled

        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .font(.role(.bodyEmphasis))
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .foregroundStyle(filled ? Color.water : Color.white)
                .padding(.horizontal, filled ? 24 : 20)
                .padding(.vertical, 6)
                .frame(minHeight: minTarget)
                .background(
                    Capsule().fill(
                        filled
                            ? Color.white.opacity(configuration.isPressed ? 0.9 : 1)
                            : Color.white.opacity(configuration.isPressed ? 0.28 : 0.18))
                )
                .contentShape(Capsule())
                .pressScale(configuration.isPressed)
                .opacity(isEnabled ? 1 : 0.6)
        }
    }

    /// A round contact action on the card: 44, white at 18% behind a white icon.
    struct HeroRoundButton: View {
        var systemImage: String
        var label: String
        var action: () -> Void

        var body: some View {
            Button(action: action) {
                Image(systemName: systemImage)
                    .font(.system(size: 18, weight: .semibold))
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
