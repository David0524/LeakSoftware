import Foundation
import SundeckCore
import SundeckSync
import Testing

@testable import SundeckApp

/// Day maps, Plan Week and locks on Schedule (owner, 2026-10-20, docs/plans/route-maps.md), from
/// the same synced rows as `ScheduleDataTests`: Tuesday Oct. 20 at 8:00 AM in Phoenix, Dana with
/// Grace (9:00, near) and Riley (11:00, far) today, Sam's maintenance visit tomorrow with no map
/// location, Diana waiting for a time, and Noah booked Thursday with no tech.
extension ScheduleDataTests {
    func route(_ tech: String, _ date: String) throws -> DayRoute {
        try #require(
            loadRoutes(jobs, ctx: ctx, dates: [date], team: team, drive: DriveTimes()).routes[routeKey(tech, date)])
    }

    var week: [String] { (try? scheduleDays(.week, ctx.today)) ?? [] }

    // MARK: - Day maps

    @Test func aDaysMapHasTheShopAndNumberedStopsInRouteOrder() throws {
        let day = try route(Self.me, ctx.today)
        let model = try #require(
            dayMapModel(
                jobs: day.jobs, depot: ctx.depot, date: ctx.today, today: ctx.today, tech: "Dana Tech",
                timeZone: ctx.timeZone))
        #expect(model.annotations.map(\.label) == ["", "1", "2"])
        // The shop as a house, the first stop not done is the one you're on, the next to do.
        #expect(model.annotations.map(\.tone) == [.shop, .current, .todo])
        #expect(model.annotations.map(\.spoken) == ["The shop", "Stop 1, Grace Holloway", "Stop 2, Riley Rivera"])
        #expect(model.annotations.map(\.id) == ["shop", id(2), id(1)])
        // The line runs from the shop through the stops and back.
        #expect(model.line.count == 4 && model.line.first == ctx.depot && model.line.last == ctx.depot)
        #expect(model.line[1] == day.jobs[0].location)
        #expect(model.label == "Map of Dana Tech’s stops on Tuesday: 2 stops")
        #expect(model.title == "Dana Tech · Tuesday")
        #expect(model.stops.map(\.time) == ["9:00 AM", "11:00 AM"])
        #expect(model.stops.map(\.customer) == ["Grace Holloway", "Riley Rivera"])
        #expect(model.drawable && model.missing == 0 && model.note == nil)
        let fit = try #require(model.fit)
        #expect(fit.latDelta > 0.2 - 0.0152 && fit.center.lat > 33.41 && fit.center.lat < 33.62)
        // The drive home is a leg like any other (owner, 2026-10-24: "the drive home is a straight
        // line"): the last stop back to the shop, drawn along the road once it has a path.
        let home = try #require(routeLegs(model.line).last)
        #expect(home.from == model.line[2] && home.to == ctx.depot)
        let bend = LatLng(lat: home.from.lat, lng: home.to.lng)
        let drawn = routeLegPaths(model.line) { $0 == home.key ? [home.from, bend, home.to] : nil }
        #expect(drawn.legs.last == [home.from, bend, home.to] && drawn.straight == 2)
        // Framed as the website's images are, for the map's size: every pin inside it.
        let framed = try #require(model.fit(w: 390, h: 200))
        for a in model.annotations {
            #expect(abs(a.at.lat - framed.center.lat) < framed.latDelta / 2)
            #expect(abs(a.at.lng - framed.center.lng) < framed.lngDelta / 2)
        }

        // Another day: nothing is "now"; a finished stop is done.
        try sync.write("job", id: id(2), companyId: Self.company, ["status": "report_sent"])
        let later = try #require(
            dayMapModel(
                jobs: try route(Self.me, ctx.today).jobs, depot: ctx.depot, date: ctx.today, today: "2026-10-19",
                tech: "Dana Tech", timeZone: ctx.timeZone))
        #expect(later.annotations.map(\.tone) == [.shop, .done, .todo])
    }

    @Test func stopsWithoutAMapLocationAreListedNotGuessed() throws {
        let day = try route(Self.sam, "2026-10-21")
        let model = try #require(
            dayMapModel(
                jobs: day.jobs, depot: ctx.depot, date: "2026-10-21", today: ctx.today, tech: "Sam Sample",
                timeZone: ctx.timeZone))
        #expect(!model.drawable)
        #expect(model.missing == 1 && model.note == "1 stop isn’t on the map")
        #expect(model.stops.map(\.located) == [false])
        #expect(model.line.isEmpty)
        #expect(missingNote(2) == "2 stops aren’t on the map" && missingNote(0) == nil)
        #expect(dayMapModel(jobs: [], depot: nil, date: ctx.today, today: ctx.today, tech: "", timeZone: "UTC") == nil)
    }

    @Test func pinsBecomeAnnotationsAndTheCameraFitsThem() {
        let pins = dayMapPins(
            stops: [
                MapStop(id: "a", location: LatLng(lat: 33.5, lng: -112), done: true),
                MapStop(id: "b", location: nil, done: false),
                MapStop(id: "c", location: LatLng(lat: 33.6, lng: -111.9), done: false),
            ], depot: nil, currentId: "c")
        let a = mapAnnotations(pins.pins, customers: ["a": "Ann", "c": "Cy"])
        // Numbers count the stop without a location, so they match the list.
        #expect(a.map(\.label) == ["1", "3"])
        #expect(a.map(\.spoken) == ["Stop 1, Ann", "Stop 3, Cy"])
        #expect(a.map(\.tone) == [.done, .current])
        // No shop: the line is just the stops.
        #expect(routeLine(a).count == 2)
        let fit = mapFit(a.map(\.at))
        #expect(fit?.center == LatLng(lat: 33.55, lng: -111.95))
        #expect(abs((fit?.latDelta ?? 0) - 0.14) < 1e-9)
        // One point gets a neighborhood around it.
        #expect(mapFit([LatLng(lat: 1, lng: 2)])?.latDelta == 0.012)
        #expect(mapFit([]) == nil)
        #expect(mapDisclosureDetail(open: true, stops: 5) == "Hide")
        #expect(mapDisclosureDetail(open: false, stops: 1) == "1 stop")
        #expect(weekdayName("2026-10-19") == "Monday")
    }

    /// Pins too close at the map's zoom are drawn apart, each numbered, with a leader line back to
    /// its place (owner, 2026-10-24: "the dots aren't placed great and the stops aren't numbered").
    @Test func crowdedPinsAreDrawnApartWithLeaderLines() throws {
        let pins = dayMapPins(
            stops: (0..<6).map {
                MapStop(id: "s\($0)", location: LatLng(lat: 33.54 + Double($0) * 0.0002, lng: -112.18), done: false)
            }, depot: LatLng(lat: 33.4484, lng: -112.074), currentId: "s2")
        let a = mapAnnotations(pins.pins, customers: [:])
        let model = DayMapModel(
            annotations: a, stops: [], located: 6, missing: 0, line: routeLine(a), label: "", title: "", fit: nil)
        let zoom = 11.0
        let sizes = crowdedStyleAt(zoom, model.placed)
        let spots = model.spots(zoom: zoom, sizes: sizes)
        let shown = try a.map { x in
            let p = projectPoint(try #require(spots[x.id]).at, zoom)
            return (p, pinSizeAt(x.tone, sizes))
        }
        for i in shown.indices {
            for j in shown.indices where j > i {
                let d = hypot(shown[i].0.x - shown[j].0.x, shown[i].0.y - shown[j].0.y)
                #expect(d >= (shown[i].1 + shown[j].1) / 2 - 0.05)
            }
        }
        #expect(spots["shop"]?.leader == false)
        // Most of the pile moved off its place, with a leader line back to it.
        #expect(a.filter { spots[$0.id]?.leader == true }.count >= 4)
        // Far enough in, they're apart by themselves: no leader lines.
        let close = model.spots(zoom: 18, sizes: crowdedStyleAt(18, model.placed))
        #expect(close.values.allSatisfy { !$0.leader })
        #expect(sizes.pinSize >= 22)
    }

    // MARK: - Locks

    @Test func cardsSayWhatKeepsAJobInPlace() throws {
        func tag(_ values: Row) throws -> LockTag? {
            try sync.write("job", id: id(1), companyId: Self.company, values)
            return lockTag(try #require(jobs.first { $0.id == id(1) }))
        }
        #expect(try tag([:]) == nil)
        #expect(try tag(["lock_day": true]) == LockTag(label: "Day locked", kind: .day))
        #expect(try tag(["lock_day": false, "lock_time": true]) == LockTag(label: "Time locked", kind: .time))
        #expect(try tag(["lock_day": true]) == LockTag(label: "Locked", kind: .both))
        // A job saved before locks with a promised time is locked both ways.
        #expect(
            try tag(["lock_day": false, "lock_time": false, "arrival_fixed": true])
                == LockTag(label: "Locked", kind: .both))
        #expect(
            try tag(["arrival_fixed": false, "second_tech_id": .string(Self.sam)])
                == LockTag(label: "Two techs", kind: .twoTechs))
        // A started job's status says it.
        #expect(try tag(["status": "in_progress", "lock_day": true]) == nil)
    }

    @Test func savingTheScheduleWithALockWritesItsColumnsInTheSameRow() throws {
        // Riley (11:00 today) to Sam tomorrow with a time lock: keeps 11:00 there.
        let (updates, message) = try scheduleWithLock(.time, jobId: id(1), jobs: jobs) { jobs in
            try moveJob(
                id(1), tech: Self.sam, date: "2026-10-21", index: 0, jobs: jobs, ctx: ctx, team: team,
                drive: DriveTimes())
        }
        #expect(message == "Moved.")
        let mine = try #require(updates.first { $0.id == id(1) })
        #expect(mine.values["lock_time"] == .bool(true) && mine.values["lock_day"] == .bool(false))
        #expect(mine.values["arrival_fixed"] == .bool(false))
        #expect(mine.values["scheduled_start"] == "2026-10-21T18:00:00.000Z")
        #expect(updates.filter { $0.id == id(1) }.count == 1)
        try saveJobUpdates(sync, companyId: Self.company, updates)
        let saved = try #require(jobs.first { $0.id == id(1) })
        #expect(jobLock(saved) == .time)

        // Only the lock: one row, nothing re-timed, and no message (owner, 2026-10-20).
        let only = lockOnlyChange(.both, jobId: id(2))
        #expect(only.message.isEmpty)
        #expect(only.updates.map(\.values) == [["lock_day": true, "lock_time": true, "arrival_fixed": true]])
        #expect(lockOnlyChange(.none, jobId: id(2)).message.isEmpty)
        #expect(lockOnlyChange(.day, jobId: id(2)).message.isEmpty)
    }

    // MARK: - Plan Week

    @Test func planWeekTakesTheMovableJobsAsTheWebsiteDoes() throws {
        let input = try weekPlanInput(
            dates: week, techs: [Self.me], tray: true, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        // Monday is past; Saturday and Sunday aren't working days.
        #expect(input.dates == ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"])
        #expect(input.techs == [Self.me])
        #expect(input.days.map(\.date) == input.dates)
        #expect(input.days.first?.earliestMin == 480 && input.days.last?.earliestMin == nil)
        // The week's own jobs first (in route order), then Needs a Time oldest first.
        #expect(input.jobs.map(\.id) == [id(2), id(1), id(4), id(5)])
        #expect(input.jobs.map(\.techId) == [Self.me, Self.me, nil, nil])
        #expect(input.jobs.map(\.techs) == [[Self.me], [Self.me], [Self.me], [Self.me]])
        #expect(input.stays.isEmpty)
        #expect(Set(input.before.keys) == [id(1), id(2), id(4), id(5)])

        // Off: only Dana's own jobs move.
        let own = try weekPlanInput(
            dates: week, techs: [Self.me], tray: false, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        #expect(own.jobs.map(\.id) == [id(2), id(1)])

        // Everyone: Sam's visit without a map location stays on his day.
        let all = try weekPlanInput(
            dates: week, techs: ["all"], tray: false, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        #expect(all.techs == [Self.me, Self.sam])
        #expect(all.stays.keys.sorted() == ["\(Self.sam)|\(id(3))"])
        #expect(all.jobs.first?.techs == [Self.me, Self.sam])
    }

    /// Several techs, split evenly (owner, 2026-10-20): the checklist's rules, and the banner's
    /// second line.
    @Test func planWeekForSeveralTechs() throws {
        let techs = planWeekTechs(team, ctx: ctx)
        let ids = techs.map(\.id)
        #expect(ids == [Self.me, Self.sam])
        #expect(planForLabel(ids, techs: techs) == "Everyone")
        #expect(planForLabel(["all"], techs: techs) == "Everyone")
        #expect(planForLabel([Self.sam], techs: techs) == techs[1].name)
        #expect(planForLabel([], techs: techs).isEmpty)
        #expect(togglePlanTech(ids, "all", techs: techs).isEmpty)
        #expect(togglePlanTech([], "all", techs: techs) == ids)
        #expect(togglePlanTech([Self.sam], Self.me, techs: techs) == ids)
        #expect(togglePlanTech(ids, Self.me, techs: techs) == [Self.sam])
        #expect(planTechs([Self.sam, Self.me, Self.sam], team: team) == ids)
        let both = try weekPlanInput(
            dates: week, techs: ids, tray: true, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        #expect(both.jobs.allSatisfy { $0.techId == nil ? true : $0.techs == ids })
        let outcome = try planTheWeek(
            dates: week, techs: ids, tray: true, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        #expect(outcome.detail?.contains(" · ") == true)
        let one = try planTheWeek(
            dates: week, techs: [Self.me], tray: true, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        #expect(one.detail == nil)
    }

    @Test func locksAndTwoTechJobsStayWhereTheyAre() throws {
        try sync.write("job", id: id(1), companyId: Self.company, ["lock_day": true])
        try sync.write("job", id: id(2), companyId: Self.company, ["lock_time": true])
        try sync.write("job", id: id(5), companyId: Self.company, ["lock_time": true, "lock_day": true])
        let input = try weekPlanInput(
            dates: week, techs: [Self.me], tray: true, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        // A day lock stays on its day; a time lock moves at its clock time; in Needs a Time, any
        // lock that keeps the time keeps it.
        #expect(input.stays.keys.sorted() == ["\(Self.me)|\(id(1))"])
        #expect(input.jobs.map(\.id) == [id(2), id(4), id(5)])
        #expect(input.jobs.map(\.timeMin) == [540, nil, 600])
        // A started job stays too: with Riley locked, Dana's week has nothing left to move.
        try sync.write("job", id: id(2), companyId: Self.company, ["status": "in_progress"])
        let withTray = try weekPlanInput(
            dates: week, techs: [Self.me], tray: true, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        #expect(withTray.stays.count == 2 && withTray.jobs.map(\.id) == [id(4), id(5)])
        #expect(
            throws: ScheduleProblem(
                "Nothing to plan: every job this week is locked, started, or shared with a second tech.")
        ) {
            try planTheWeek(
                dates: week, techs: [Self.me], tray: false, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        }
        #expect(throws: ScheduleProblem("No working days left this week to plan.")) {
            try weekPlanInput(
                dates: ["2026-10-19", "2026-10-24"], techs: [Self.me], tray: true, jobs: jobs, ctx: ctx, team: team,
                drive: DriveTimes())
        }
    }

    @Test func planWeekSavesThroughTheSyncLayerAndUndoPutsItBack() throws {
        let original = try [1, 2, 4, 5].map { try #require(try sync.store.get("job", id($0))) }
        let outcome = try planTheWeek(
            dates: week, techs: [Self.me], tray: true, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        // Diana and Noah come onto Dana's week.
        #expect(outcome.message.hasPrefix("Moved "))
        #expect(Set(outcome.updates.map(\.id)).isSuperset(of: [id(4), id(5)]))
        let diana = try #require(outcome.updates.first { $0.id == id(4) })
        #expect(diana.values["assigned_user_id"] == .string(Self.me) && diana.values["status"] == "scheduled")
        // Undo holds each changed job's values from before, once each.
        #expect(outcome.undo.map(\.id) == outcome.updates.map(\.id))
        let pending = sync.status.pending
        try saveJobUpdates(sync, companyId: Self.company, outcome.updates)
        #expect(sync.status.pending == pending + outcome.updates.count)
        #expect(try sync.store.get("job", id(4))?["assigned_user_id"] == .string(Self.me))

        // Planned again, nothing changes, so there's nothing to undo.
        let again = try planTheWeek(
            dates: week, techs: [Self.me], tray: true, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        #expect(again.updates.isEmpty && again.undo.isEmpty)

        try saveJobUpdates(sync, companyId: Self.company, undoWeekPlan(outcome.undo))
        for (n, was) in zip([1, 2, 4, 5], original) {
            let now = try #require(try sync.store.get("job", id(n)))
            for key in ["status", "assigned_user_id", "route_order"] { #expect(now[key] ?? .null == was[key] ?? .null) }
            for key in ["scheduled_start", "scheduled_end"] {
                #expect(parseInstant(now[key]?.string) == parseInstant(was[key]?.string))
            }
        }
        #expect(weekPlanUndone == "Put back as it was.")
    }

    @Test func undoRowsHoldEveryPlannedColumn() {
        let row = WeekUndoRow(try! #require(jobs.first { $0.id == id(4) }))
        #expect(
            row.values == [
                "status": "unscheduled", "assigned_user_id": .null, "scheduled_start": .null, "scheduled_end": .null,
                "route_order": .null,
            ])
        #expect(sameValue("2026-10-20T16:00:00Z", "2026-10-20T16:00:00.000Z"))
        #expect(!sameValue(.null, "scheduled"))
    }

    @Test func thePlanWeekSheetsChoices() {
        let dates = planWeekDates(week, today: ctx.today)
        #expect(dates.first == "2026-10-20" && dates.count == 6)
        #expect(planWeekWaiting(needsATime(jobs, ctx: ctx), dates: dates, timeZone: ctx.timeZone) == 2)
        #expect(planWeekWaiting(needsATime(jobs, ctx: ctx), dates: ["2026-10-20"], timeZone: ctx.timeZone) == 1)
        #expect(planWeekTechs(team, ctx: ctx).map(\.id) == [Self.me, Self.sam])
        #expect(planWeekHelp.hasPrefix("Puts this week’s movable jobs on days for the least driving."))
    }
}
