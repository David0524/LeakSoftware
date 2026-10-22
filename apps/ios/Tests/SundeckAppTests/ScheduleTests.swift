import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

/// The routing rules ported from packages/core (routing.ts, route-plan.ts, office.ts), with the
/// numbers the TypeScript gives.
@Suite struct RoutePlanTests {
    let shop = LatLng(lat: 33.4152, lng: -111.8315)
    let near = LatLng(lat: 33.4252, lng: -111.8315)
    let far = LatLng(lat: 33.6152, lng: -111.8315)

    @Test func estimatesDrivingLikeTheWebsite() {
        #expect(estimateDriveMinutes(nil, shop) == 0)
        #expect(estimateDriveMinutes(shop, shop) == 0)
        // 1.11 km straight, 1.5 km by road at 40 km/h, plus 3 minutes.
        #expect(estimateDriveMinutes(shop, near) == 5)
        // 22.2 km straight, 30 km by road: 10 km city, 20 km freeway.
        #expect(estimateDriveMinutes(shop, far) == 34)
        #expect(pointKey(LatLng(lat: 33.41523, lng: -111.83149)) == "33.4152,-111.8315")
        #expect(DriveTimes(known: ["33.4152,-111.8315>33.4252,-111.8315": 9]).minutes(shop, near) == 9)
    }

    @Test func timesARouteAndFindsTheBestOrder() {
        let day = WorkDay(startMin: 480, endMin: 1020)
        let drive = DriveTimes().drive
        let stops = [
            RouteStop(id: "far", location: far, durationMin: 60),
            RouteStop(id: "near", location: near, durationMin: 60),
        ]
        let r = timeRoute(stops, depot: shop, day: day, drive: drive)
        #expect(r.stops.map(\.startMin) == [514, 574 + estimateDriveMinutes(far, near)])
        #expect(r.driveMin == 34 + estimateDriveMinutes(far, near) + 5)
        let (order, best) = optimizeRoute(stops, depot: shop, day: day, drive: drive)
        // Either order drives the same loop; ties keep the current order.
        #expect(order == [0, 1])
        #expect(best.driveMin == r.driveMin)

        // A fixed 8:00 appointment far away goes first.
        let fixed = [
            RouteStop(id: "near", location: near, durationMin: 60),
            RouteStop(id: "far", location: far, durationMin: 60, fixedStartMin: 480, movable: false),
        ]
        #expect(optimizeRoute(fixed, depot: shop, day: day, drive: drive).order == [1, 0])
        #expect(optimizeRoute([], depot: shop, day: day, drive: drive).order.isEmpty)
    }

    @Test func summarizesASavedDay() {
        let s = daySummary(
            [
                SavedStop(id: "a", location: near, startMin: 480, endMin: 600),
                SavedStop(id: "b", location: far, startMin: 610, endMin: 700),
                SavedStop(id: "c", location: nil, startMin: 720, endMin: 780),
            ], depot: shop, day: WorkDay(startMin: 480, endMin: 750), drive: DriveTimes().drive)
        let farFromNear = estimateDriveMinutes(near, far)
        #expect(s.legs == [5, farFromNear, 0])
        // b starts 10 minutes after a ends, but the drive is longer.
        #expect(s.short == [0, farFromNear - 10, 0])
        #expect(s.backMin == 780 + 34)
        #expect(s.overtimeMin == 780 + 34 - 750)
        #expect(s.unlocated == 1)
        #expect(s.backLegMin == 34)
    }

    @Test func suggestsTheCheapestPlaceSoonerFirst() {
        let day = WorkDay(startMin: 480, endMin: 1020)
        let days = [
            TechDay(
                date: "2026-10-20", techId: "t1", techName: "Tony",
                stops: [
                    RouteStop(id: "a", location: near, durationMin: 60, fixedStartMin: 540)
                ], labels: ["a": "Grace Holloway"]),
            TechDay(date: "2026-10-21", techId: "t1", techName: "Tony", stops: []),
        ]
        let found = suggestSlots(
            location: near, durationMin: 60, days: days, depot: shop, day: day, drive: DriveTimes().drive)
        #expect(found.map(\.date) == ["2026-10-20", "2026-10-21"])
        #expect(found[0].near == "after Grace Holloway")
        #expect(found[0].addedDriveMin == 0)
        #expect(found[1].near == "only job that day")
    }

    @Test func wordsAndTimes() {
        #expect(minutesLabel(510) == "8:30 AM")
        #expect(minutesLabel(0) == "12:00 AM")
        #expect(minutesLabel(780) == "1:00 PM")
        #expect(minutesToClock(510) == "08:30")
        #expect(clockToMinutes("17:15") == 1035)
        #expect(durationLabel(25) == "25 min")
        #expect(durationLabel(60) == "1 hr")
        #expect(durationLabel(65) == "1 hr 5 min")
        #expect(arrivalText(612, windowMin: 60) == "between 10:00 AM and 11:00 AM")
        #expect(
            onMyWayText(customer: "Riley Rivera", tech: "Tony Tech", shop: "Desert Leak Co.", arriveMin: 642)
                == "Hi Riley, this is Tony from Desert Leak Co. I’m on my way and should be there about 10:45 AM.")
        #expect(
            onMyWayText(customer: nil, tech: "Tony", shop: "Desert Leak", arriveMin: 600, windowMin: 120)
                == "Hi, this is Tony from Desert Leak. I’m on my way and should be there between 10:00 AM and 12:00 PM."
        )
    }

    @Test func daysAndMonths() throws {
        // SundeckCore's date rules throw on a day that isn't one, as the TypeScript does.
        #expect(try addDays("2026-10-31", 1) == "2026-11-01")
        #expect(weekday("2026-10-18") == 0)
        #expect(try weekStart("2026-10-18") == "2026-10-12")
        #expect(try addMonths("2026-01-31", 1) == "2026-02-28")
        #expect(try addMonths("2026-12-15", 1) == "2027-01-15")
        #expect(try addMonths("2026-01-15", -1) == "2025-12-15")
        let grid = try monthGrid("2026-10-18")
        #expect(grid.first == "2026-09-28" && grid.last == "2026-11-01" && grid.count == 35)
        #expect(try scheduleDays(.week, "2026-10-18").count == 7)
        #expect(formatDay("2026-10-18", long: true) == "Sunday, October 18")
        #expect(formatDay("2026-10-18") == "Sun, Oct 18")
        #expect(formatMonth("2026-10-18") == "October 2026")
        #expect(formatTime("2026-10-12T16:00:00+00:00", timeZone: "America/Phoenix") == "9:00 AM")
        #expect(formatTime("2026-10-12 16:30:00+00", timeZone: "America/Phoenix") == "9:30 AM")
        #expect(formatShortDate("2026-10-15T20:00:00.000Z", timeZone: "America/Phoenix") == "Oct 15, 2026")
        let start = try? #require(zonedInstant("2026-10-20", 540, timeZone: "America/Phoenix"))
        #expect(start.map(isoString) == "2026-10-20T16:00:00.000Z")
    }

    @Test func readsTheShopsSettings() {
        let s = routingSettings([
            "routing": [
                "day_start": "07:30", "day_end": "06:00", "arrival_window_minutes": 60, "job_minutes": 90,
                "work_days": [6, 1, 1, 9],
            ]
        ])
        #expect(s.dayStart == "07:30" && s.dayEnd == "17:00")
        #expect(s.windowMin == 60 && s.jobMinutes == 90 && s.workDays == [1, 6])
        #expect(routingSettings(nil) == RoutingSettings())
        #expect(onMyWayFromPhone(["on_my_way": "phone"]) && !onMyWayFromPhone([:]))
    }

    @Test func mapsLinks() {
        let place = MapPlace(address: "1423 Palm Ct, Mesa, AZ", location: near)
        #expect(
            directionsURL(place, app: .google)?.absoluteString
                == "https://www.google.com/maps/dir/?api=1&destination=33.4252%2C-111.8315&travelmode=driving")
        #expect(directionsURL(place, app: .apple)?.absoluteString.hasPrefix("https://maps.apple.com/?daddr=") == true)
        let route = routeLink(origin: MapPlace(address: "Shop", location: shop), stops: [place])
        #expect(
            route?.absoluteString
                == "https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=33.4152%2C-111.8315&origin=33.4152%2C-111.8315&waypoints=33.4252%2C-111.8315"
        )
        // Apple Maps opens the next stop not done.
        let other = MapPlace(address: "88 Desert Willow Dr")
        let next = dayDirections(app: .apple, origin: nil, stops: [(place, true), (other, false)])
        #expect(next?.absoluteString.contains("Desert") == true)
    }
}

/// Today and Schedule from synced rows, and the planning writes through the sync layer.
@MainActor @Suite struct ScheduleDataTests {
    static let company = "00000000-0000-4000-8000-0000000000c1"
    static let me = "00000000-0000-4000-8000-0000000000a1"
    static let sam = "00000000-0000-4000-8000-0000000000a2"
    /// 2026-10-20T15:00:00Z: 8:00 AM Tuesday in Phoenix.
    static let now = Date(timeIntervalSince1970: 1_792_508_400)

    let sync: SyncService

    init() throws {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("schedule-\(UUID()).db").path
        let database = try Database(path: path, key: String(repeating: "4d", count: 32))
        sync = SyncService(
            store: try LocalStore.open(database), kv: try KeyValue(database),
            transport: NewJobFormTests.NeverTransport(), auth: NewJobFormTests.NoAuth())
        sync.kv.setTeam([
            TeamProfile(id: Self.me, fullName: "Dana Tech", email: nil),
            TeamProfile(id: Self.sam, fullName: "Sam Sample", email: nil),
        ])
        var rows: [PulledRow] = [
            PulledRow(
                table: "company", xid: "1",
                row: [
                    "id": .string(Self.company), "company_id": .string(Self.company), "name": "Desert Leak Co.",
                    "timezone": "America/Phoenix", "latitude": 33.4152, "longitude": -111.8315,
                    "address_line1": "1 Shop Way", "city": "Mesa", "state": "AZ", "postal_code": "85201",
                ])
        ]
        for (i, user) in [Self.me, Self.sam].enumerated() {
            rows.append(
                PulledRow(
                    table: "membership", xid: "1",
                    row: [
                        "id": .string("00000000-0000-4000-8000-00000000050\(i)"), "company_id": .string(Self.company),
                        "user_id": .string(user), "role": i == 0 ? "owner" : "tech", "status": "active",
                    ]))
        }
        func job(
            _ n: Int, _ customer: String, start: String?, end: String?, tech: String?, lat: Double?,
            status: String = "scheduled", type: String = "detection"
        )
            -> [PulledRow]
        {
            let c = "00000000-0000-4000-8000-00000000030\(n)"
            let p = "00000000-0000-4000-8000-00000000040\(n)"
            return [
                PulledRow(
                    table: "customer", xid: "1",
                    row: [
                        "id": .string(c), "company_id": .string(Self.company), "name": .string(customer),
                        "phone": "(602) 555-0100",
                    ]),
                PulledRow(
                    table: "property", xid: "1",
                    row: [
                        "id": .string(p), "company_id": .string(Self.company), "customer_id": .string(c),
                        "address_line1": .string("\(n) Palm Ct"), "city": "Mesa", "has_pool": true,
                        "latitude": lat.map { .number($0) } ?? .null,
                        "longitude": lat.map { _ in .number(-111.8315) } ?? .null,
                        "access_notes": n == 1 ? "Gate code 4417" : .null,
                    ]),
                PulledRow(
                    table: "job", xid: "1",
                    row: [
                        "id": .string("00000000-0000-4000-8000-00000000060\(n)"), "company_id": .string(Self.company),
                        "number": .number(Double(1040 + n)), "status": .string(status), "type": .string(type),
                        "property_id": .string(p), "bill_to_customer_id": .string(c),
                        "assigned_user_id": tech.map { .string($0) } ?? .null,
                        "scheduled_start": start.map { .string($0) } ?? .null,
                        "scheduled_end": end.map { .string($0) } ?? .null,
                        "created_at": .string("2026-10-0\(n)T00:00:00Z"),
                    ]),
            ]
        }
        // Today: two stops for me, out of order by distance (far first at 9, near at 11).
        rows += job(
            1, "Riley Rivera", start: "2026-10-20T18:00:00Z", end: "2026-10-20T19:00:00Z", tech: Self.me, lat: 33.6152)
        rows += job(
            2, "Grace Holloway", start: "2026-10-20T16:00:00Z", end: "2026-10-20T17:00:00Z", tech: Self.me, lat: 33.4252
        )
        // Sam tomorrow; one waiting for a time; one booked with no tech; one canceled.
        rows += job(
            3, "Sam Customer", start: "2026-10-21T16:00:00Z", end: "2026-10-21T18:00:00Z", tech: Self.sam, lat: nil,
            type: "maintenance")
        rows += job(
            4, "Diana Foster", start: nil, end: nil, tech: nil, lat: 33.43, status: "unscheduled", type: "repair")
        rows += job(5, "Noah Tech", start: "2026-10-22T17:00:00Z", end: nil, tech: nil, lat: 33.44)
        rows += job(
            6, "Gone Away", start: "2026-10-20T20:00:00Z", end: nil, tech: Self.me, lat: 33.44, status: "canceled")
        try sync.store.applyPage(PullPage(rows: rows, done: true, cursor: [:], serverHLC: "1792508400000-0000-server"))
    }

    var company: CompanyContext {
        CompanyContext(id: Self.company, name: "Desert Leak", timeZone: "America/Phoenix", settings: [:], role: "owner")
    }
    var ctx: ScheduleContext { scheduleContext(sync.store, company: company, userId: Self.me, now: Self.now) }
    var team: [TeamMember] { teamMembers(sync.store, kv: sync.kv, companyId: Self.company, userId: Self.me) }
    var jobs: [ScheduleJob] { scheduleJobs(sync.store, companyId: Self.company) }
    func id(_ n: Int) -> String { "00000000-0000-4000-8000-00000000060\(n)" }

    @Test func readsTheShopAndTeam() {
        #expect(ctx.today == "2026-10-20" && ctx.nowMin == 480)
        #expect(ctx.depotAddress == "1 Shop Way, Mesa, AZ 85201")
        #expect(ctx.shopZip == "85201" && ctx.shopName == "Desert Leak Co.")
        #expect(team.map(\.name) == ["Dana Tech", "Sam Sample"])
    }

    /// Reorder Techs (owner, 2026-10-21): Done writes the places that changed through the sync
    /// layer, and the Schedule's order follows them, Me first only until there's a saved order.
    @Test func reorderTechsSavesTheOrderThroughTheSyncLayer() throws {
        #expect(scheduleTeam(team, me: Self.sam).map(\.id) == [Self.sam, Self.me])
        #expect(scheduleTeam(team, me: Self.me).map(\.id) == [Self.me, Self.sam])
        let pending = sync.status.pending
        let ordered = [Self.sam, Self.me].compactMap { id in team.first { $0.id == id }?.membershipId }
        let writes = try TechOrderWrites.save(sync, companyId: Self.company, team: team, ordered: ordered)
        #expect(writes.map(\.scheduleOrder) == [1, 2])
        #expect(sync.status.pending == pending + 2)
        #expect(team.map(\.scheduleOrder) == [2, 1])
        // The saved order wins over Me first.
        #expect(scheduleTeam(team, me: Self.me).map(\.id) == [Self.sam, Self.me])
        // Done again with nothing moved writes nothing.
        #expect(try TechOrderWrites.save(sync, companyId: Self.company, team: team, ordered: ordered).isEmpty)
    }

    @Test func todaysRouteIsInTimeOrderWithDriveTimes() throws {
        let loaded = loadRoutes(jobs, ctx: ctx, dates: [ctx.today], team: team, drive: DriveTimes())
        let route = try #require(loaded.routes[routeKey(Self.me, ctx.today)])
        // The canceled job isn't on the route.
        #expect(route.jobs.map(\.customerName) == ["Grace Holloway", "Riley Rivera"])
        #expect(route.techName == "Dana Tech")
        #expect(route.summary.legs[0] == 5)
        #expect(route.summary.backMin == 12 * 60 + 34)
        #expect(route.jobs[1].accessNotes == "Gate code 4417")
        #expect(formatTime(route.jobs[0].scheduledStart, timeZone: "America/Phoenix") == "9:00 AM")
        let tray = needsATime(jobs, ctx: ctx)
        #expect(tray.map(\.customerName) == ["Diana Foster", "Noah Tech"])
    }

    @Test func planRouteSavesTheNewOrderThroughTheSyncLayer() throws {
        // The far stop first at 8:30; either order drives the same loop, so planning keeps it and
        // pulls both stops as early as the day allows.
        try sync.write(
            "job", id: id(1), companyId: Self.company,
            ["scheduled_start": "2026-10-20T15:30:00Z", "scheduled_end": "2026-10-20T16:30:00Z"])
        let (updates, message) = try planRoute(
            techId: Self.me, date: ctx.today, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        #expect(message.hasPrefix("Optimized · "))
        #expect(updates.map(\.id) == [id(1), id(2)])
        #expect(updates.map { $0["route_order"] } == [1, 2])
        let pending = sync.status.pending
        try saveJobUpdates(sync, companyId: Self.company, updates)
        #expect(sync.status.pending == pending + 2)
        let far = try #require(try sync.store.get("job", id(1)))
        // Leaves at 8:00 (now), 34 minutes away.
        #expect(far["scheduled_start"] == "2026-10-20T15:34:00.000Z")
        #expect(far["scheduled_end"] == "2026-10-20T16:34:00.000Z")
        #expect(far["route_order"] == 1)
        #expect(throws: ScheduleProblem("Past days can’t be planned.")) {
            try planRoute(techId: Self.me, date: "2026-10-19", jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        }
    }

    @Test func optimizeSavesWhatPlanRouteSavesAndSaysItInOneLine() throws {
        try sync.write(
            "job", id: id(1), companyId: Self.company,
            ["scheduled_start": "2026-10-20T15:30:00Z", "scheduled_end": "2026-10-20T16:30:00Z"])
        let planned = try planRoute(
            techId: Self.me, date: ctx.today, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        let optimized = try optimizeDay(
            techId: Self.me, date: ctx.today, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        #expect(optimized.updates == planned.updates)
        // Already in the best order (the same loop either way): it says so, with nothing to undo
        // (owner, 2026-10-22).
        #expect(optimized.summary.title == optimizeAlreadyBest)
        #expect(optimized.undo.isEmpty)
        #expect(optimized.summary.warning == nil)
        #expect(throws: ScheduleProblem("Past days can’t be planned.")) {
            try optimizeDay(techId: Self.me, date: "2026-10-19", jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        }
    }

    /// Optimize with Undo (owner, 2026-10-22: "Make Optimize show the new order at once, with
    /// Undo"): Undo holds the saved values of the rows it changes, and Optimize again from the new
    /// order says "Already the best order" with nothing to undo, as the website and Android do.
    @Test func optimizeHasUndoAndSaysWhenTheOrderIsAlreadyBest() throws {
        // Three stops booked far, near, far: the near one belongs first.
        try sync.write(
            "job", id: id(1), companyId: Self.company,
            ["scheduled_start": "2026-10-20T15:30:00Z", "scheduled_end": "2026-10-20T16:30:00Z", "route_order": 1])
        try sync.write(
            "job", id: id(2), companyId: Self.company,
            ["scheduled_start": "2026-10-20T17:00:00Z", "scheduled_end": "2026-10-20T18:00:00Z", "route_order": 2])
        try sync.write(
            "property", id: "00000000-0000-4000-8000-000000000403", companyId: Self.company,
            ["latitude": 33.6252, "longitude": -111.8315])
        try sync.write(
            "job", id: id(3), companyId: Self.company,
            [
                "assigned_user_id": .string(Self.me), "scheduled_start": "2026-10-20T20:00:00Z",
                "scheduled_end": "2026-10-20T21:00:00Z", "route_order": 3,
            ])
        let first = try optimizeDay(
            techId: Self.me, date: ctx.today, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        #expect(first.summary.title.hasPrefix("Optimized · "))
        #expect(!first.undo.isEmpty)
        #expect(Set(first.undo.map(\.id)).isSubset(of: Set(first.updates.map(\.id))))
        for u in first.undo {
            let was = try #require(jobs.first { $0.id == u.id })
            #expect(u.values["route_order"] == (was.routeOrder.map { .number(Double($0)) } ?? .null))
            #expect(Set(u.values.keys).isSubset(of: ["route_order", "scheduled_start", "scheduled_end"]))
        }
        if first.undo.isEmpty { #expect(first.summary.title == optimizeAlreadyBest) }
        var after = jobs
        for u in first.updates {
            guard let i = after.firstIndex(where: { $0.id == u.id }) else { continue }
            if case .number(let n)? = u.values["route_order"] { after[i].routeOrder = Int(n) }
            if case .string(let v)? = u.values["scheduled_start"] { after[i].scheduledStart = v }
            if case .string(let v)? = u.values["scheduled_end"] { after[i].scheduledEnd = v }
        }
        let again = try optimizeDay(
            techId: Self.me, date: ctx.today, jobs: after, ctx: ctx, team: team, drive: DriveTimes())
        #expect(again.summary.title == optimizeAlreadyBest)
        #expect(again.undo.isEmpty)
        #expect(optimizePutBack == "The order is as it was.")
    }

    @Test func poolsNeverLookedUpAreAskedForOnce() throws {
        MissingPins.reset()
        // Sam's pool has an address and no map location, and was never looked up.
        let pool = "00000000-0000-4000-8000-000000000403"
        #expect(jobs.filter(\.needsLocate).map(\.propertyId) == [pool])
        #expect(MissingPins.toAsk(jobs) == [pool])
        // Looked up for this address and not found: "Not on map", not asked again.
        let row = try #require(try sync.store.get("property", pool))
        let address = formatAddress(try #require(decodeProperty(row)))
        try sync.write("property", id: pool, companyId: Self.company, ["geocoded_address": .string(address)])
        #expect(jobs.filter(\.needsLocate).isEmpty)
        #expect(MissingPins.toAsk(jobs).isEmpty)
    }

    @Test func movingAJobOntoADayAndOffTheSchedule() throws {
        // Diana (Needs a Time) onto Sam's day tomorrow, first.
        var (updates, message) = try moveJob(
            id(4), tech: Self.sam, date: "2026-10-21", index: 0, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        #expect(message == "Moved.")
        let mine = try #require(updates.first)
        #expect(mine.id == id(4))
        #expect(mine["assigned_user_id"] == .string(Self.sam))
        #expect(mine["status"] == "scheduled")
        #expect(mine["route_order"] == 1)
        try saveJobUpdates(sync, companyId: Self.company, updates)
        #expect(try sync.store.get("job", id(4))?["scheduled_start"]?.string?.hasPrefix("2026-10-21") == true)

        // Nobody yet: keeps its time and waits in Needs a Time.
        (updates, message) = try moveJob(
            id(4), tech: nil, date: "2026-10-22", index: 0, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        #expect(message.hasPrefix("No tech yet, so it’s in Needs a Time, still booked for "))
        #expect(updates[0]["assigned_user_id"] == .null)

        // Off the schedule.
        (updates, message) = try moveJob(
            id(2), tech: nil, date: nil, index: 0, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        #expect(message == "Taken off the schedule.")
        #expect(updates[0]["status"] == "unscheduled" && updates[0]["scheduled_start"] == .null)
        // The stop left behind moves up to first.
        #expect(updates.dropFirst().map(\.id) == [id(1)])

        #expect(throws: ScheduleProblem("Pick today or a later day.")) {
            try moveJob(
                id(2), tech: Self.me, date: "2026-10-19", index: 0, jobs: jobs, ctx: ctx, team: team,
                drive: DriveTimes())
        }
    }

    /// Owner, 2026-10-21: "when you try to lock the time in the schedule, it removes almost
    /// everyone from the routes." Locking a stop (alone, or through the Move sheet's Save with
    /// its lock) keeps every stop on every tech's route.
    @Test func lockingAStopsTimeKeepsEveryStopOnTheRoutes() throws {
        let days = ["2026-10-20", "2026-10-21", "2026-10-22"]
        func stops() -> [String: [String]] {
            loadRoutes(jobs, ctx: ctx, dates: days, team: team, drive: DriveTimes()).routes
                .mapValues { $0.jobs.map(\.id) }
        }
        let before = stops()
        #expect(before.values.reduce(0) { $0 + $1.count } == 3)
        try saveJobUpdates(sync, companyId: Self.company, lockOnlyChange(.time, jobId: id(1)).updates)
        #expect(stops() == before)
        #expect(jobs.first { $0.id == id(1) }?.lockTime == true)
        // The Move sheet's Save with a lock, the stop staying where it is.
        let saved = try scheduleWithLock(.both, jobId: id(3), jobs: jobs) { locked in
            try moveJob(
                id(3), tech: Self.sam, date: "2026-10-21", index: 0, jobs: locked, ctx: ctx, team: team,
                drive: DriveTimes())
        }
        try saveJobUpdates(sync, companyId: Self.company, saved.updates)
        #expect(stops() == before)
    }

    @Test func draggingAStopMovesItLikeMove() throws {
        func drop(_ n: Int, _ target: ScheduleDrop) throws -> (updates: [JobUpdate], message: String)? {
            try dropJob(id(n), on: target, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        }
        // Today's route is Grace (first) then Riley. Riley onto Grace's place goes first.
        let first = try #require(try drop(1, .route(tech: Self.me, date: "2026-10-20", index: 0)))
        #expect(first.message == "Moved.")
        #expect(first.updates[0].id == id(1) && first.updates[0]["route_order"] == 1)
        // Dropped where it already is: nothing to do.
        #expect(try drop(2, .route(tech: Self.me, date: "2026-10-20", index: 0)) == nil)
        #expect(try drop(1, .route(tech: Self.me, date: "2026-10-20", index: nil)) == nil)
        #expect(try drop(2, .day("2026-10-20")) == nil)
        #expect(try drop(4, .needsATime) == nil)
        #expect(try drop(5, .needsATime) == nil)

        // Onto another tech's day, and onto a day in the week strip (keeps its tech, goes last).
        let sams = try #require(try drop(2, .route(tech: Self.sam, date: "2026-10-21", index: 0)))
        #expect(sams.updates[0]["assigned_user_id"] == .string(Self.sam))
        let tomorrow = try #require(try drop(2, .day("2026-10-21")))
        #expect(tomorrow.updates[0]["assigned_user_id"] == .string(Self.me))
        #expect(tomorrow.updates[0]["scheduled_start"]?.string?.hasPrefix("2026-10-21") == true)
        // Needs a Time onto a route gets a tech and a time.
        let booked = try #require(try drop(4, .route(tech: Self.me, date: "2026-10-21", index: nil)))
        #expect(booked.updates[0]["status"] == "scheduled")

        // Onto Needs a Time: off the schedule.
        let off = try #require(try drop(2, .needsATime))
        #expect(off.message == "Taken off the schedule.")

        // Past days refuse, as the website does.
        #expect(throws: ScheduleProblem("Pick today or a later day.")) { try drop(2, .day("2026-10-19")) }
        #expect(throws: ScheduleProblem("Pick today or a later day.")) {
            try drop(2, .route(tech: Self.me, date: "2026-10-19", index: nil))
        }
        // A canceled job stays put.
        #expect(throws: ScheduleProblem("This job was canceled, so it stays off the schedule.")) {
            try drop(6, .day("2026-10-21"))
        }
    }

    @Test func aStartedStopKeepsItsStatusAndStaysOnTheSchedule() throws {
        try sync.write("job", id: id(1), companyId: Self.company, ["status": "in_progress"])
        let moved = try #require(
            try dropJob(id(1), on: .day("2026-10-21"), jobs: jobs, ctx: ctx, team: team, drive: DriveTimes()))
        #expect(moved.updates[0]["status"] == "in_progress")
        #expect(
            throws: ScheduleProblem(
                "This job has started, so it stays on the schedule. Move it to another day instead.")
        ) {
            try dropJob(id(1), on: .needsATime, jobs: jobs, ctx: ctx, team: team, drive: DriveTimes())
        }
        #expect(!isFinished(.inProgress) && !isFinished(.scheduled) && !isFinished(.canceled))
        #expect(isFinished(.done) && isFinished(.reportSent) && isFinished(.paid))
    }

    @Test func aLimitedTechMovesOnlyTheirOwnJobs() {
        var limited = ctx
        limited.seesAll = false
        #expect(
            throws: ScheduleProblem(
                "You can schedule only your own jobs. Ask an owner to move it to someone else.")
        ) {
            try moveJob(
                id(2), tech: Self.sam, date: "2026-10-21", index: 0, jobs: jobs, ctx: limited, team: team,
                drive: DriveTimes())
        }
    }

    @Test func suggestsTimesInTheNextWorkingDays() throws {
        let job = try #require(jobs.first { $0.id == id(4) })
        let (list, note) = try suggestTimes(
            location: job.location, durationMin: 60, excluding: job.id, jobs: jobs, ctx: ctx, team: team,
            drive: DriveTimes())
        #expect(note == nil)
        #expect(!list.isEmpty && list.count <= 5)
        #expect(list[0].dayLabel == "Today")
        #expect(list[0].detail.hasPrefix("Adds "))
    }

    // MARK: - Jobs and Reports lists

    @Test func jobsListFiltersSearchesAndOrdersAsTheWebsite() throws {
        let views = try jobViews(sync.store, companyId: Self.company)
        let names = Dictionary(team.map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
        let list = { (filter: JobFilter, search: String, seesAll: Bool) in
            jobList(
                views, filter: filter, search: search, now: Self.now, timeZone: "America/Phoenix", userId: Self.me,
                seesAll: seesAll, names: names)
        }
        let open = list(.open, "", true)
        // Soonest first, unscheduled last; canceled not open.
        #expect(
            open.map(\.customer) == ["Grace Holloway", "Riley Rivera", "Sam Customer", "Noah Tech", "Diana Foster"])
        #expect(open[0].kind == "#1042 · Leak detection")
        #expect(open[0].address == "2 Palm Ct, Mesa")
        #expect(open[0].when == "9:00 AM · Dana Tech")
        #expect(open[2].when == "Wed, Oct 21, 9:00 AM · Sam Sample")
        #expect(open[4].when == "Not scheduled · Unassigned")
        #expect(list(.canceled, "", true).map(\.customer) == ["Gone Away"])
        #expect(list(.all, "", true).count == 6)
        #expect(list(.open, "grace", true).map(\.customer) == ["Grace Holloway"])
        #expect(list(.open, "#1044", true).map(\.customer) == ["Diana Foster"])
        // A tech limited to their own jobs.
        #expect(list(.open, "", false).map(\.customer) == ["Grace Holloway", "Riley Rivera"])
        #expect(JobFilter.allCases.map(\.title).first == "Open")
    }

    @Test func reportsListNewestFirst() throws {
        try sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "report", xid: "2",
                        row: [
                            "id": "r1", "company_id": .string(Self.company), "job_id": .string(id(1)),
                            "template_key": "homeowner", "version": 2, "status": "sent",
                            "sent_at": "2026-10-15T20:00:00Z", "updated_at": "2026-10-15T20:00:00Z",
                        ]),
                    PulledRow(
                        table: "report", xid: "2",
                        row: [
                            "id": "r2", "company_id": .string(Self.company), "job_id": .string(id(2)),
                            "template_key": "partner", "version": 1, "status": "draft",
                            "updated_at": "2026-10-16T20:00:00Z",
                        ]),
                    PulledRow(
                        table: "report", xid: "2",
                        row: [
                            "id": "r0", "company_id": .string(Self.company), "job_id": .string(id(1)),
                            "template_key": "homeowner", "version": 1, "status": "superseded",
                            "updated_at": "2026-10-14T20:00:00Z",
                        ]),
                ], done: true, cursor: [:], serverHLC: "1792508400001-0000-server"))
        let all = reportList(sync.store, companyId: Self.company, filter: .all, timeZone: "America/Phoenix")
        #expect(all.map(\.id) == ["r2", "r1"])
        #expect(all[1].customer == "Riley Rivera" && all[1].job == "Job #1041")
        #expect(all[1].detail == "Homeowner report · version 2 · 1 Palm Ct")
        #expect(all[1].value == "Sent Oct 15, 2026")
        #expect(all[0].value == "Draft" && all[0].detail == "Pool company report · 2 Palm Ct")
        #expect(reportList(sync.store, companyId: Self.company, filter: .draft, timeZone: "UTC").map(\.id) == ["r2"])
        #expect(ReportFilter.sent.empty == "No reports sent yet.")
    }

    @Test func weatherReadsTheAPIReply() {
        let w = Weather(["tempF": 76, "conditions": "Mostly Clear", "kind": "partly", "isDaytime": false, "highF": 85])
        #expect(w == Weather(kind: "partly", tempF: 76, conditions: "Mostly Clear", isDaytime: false, highF: 85))
        #expect(w?.accessibilityLabel == "Weather: 76°F, Mostly Clear, high 85°")
        #expect(Weather(.null) == nil)
    }
}

extension JobUpdate {
    fileprivate subscript(_ key: String) -> JSONValue? { values[key] }
}
