import Foundation
import SundeckCore
import Testing

@testable import SundeckApp

/// Week's routes work and Settings › Team (owner, 2026-10-20; docs/design/2026-10-20-team-week.md).
@Suite struct WeekRoutesTests {
    func plan(_ id: String, tech: String?, startsOn: String = "2026-10-20", created: String) -> RoutePlanCard {
        let p = ServicePlan(
            id: id, customerId: nil, propertyId: nil, assignedUserId: tech, startsOn: startsOn, intervalWeeks: 1,
            weekdays: nil, monthly: false, visitTime: nil, durationMinutes: 30, priceCents: nil, endsOn: nil,
            paused: false, notes: nil)
        return RoutePlanCard(
            planId: id, plan: p, customer: "Customer \(id)", address: "", location: nil, techId: tech,
            days: serviceDays(p), durationMin: 30, repeats: planRepeat(p), createdAt: created)
    }

    @Test func customersToAddAreThePlansWithNobodyNewestFirst() {
        let plans = [
            plan("a", tech: nil, created: "2026-10-01"),
            plan("b", tech: "luis", created: "2026-10-05"),
            plan("c", tech: "gone", created: "2026-10-03"),
            plan("d", tech: nil, created: "2026-10-04"),
        ]
        #expect(customersToAdd(plans, techIds: ["luis"]).map(\.planId) == ["d", "c", "a"])
    }

    @Test func aPlanMovesToAWeekdayWithItsTech() throws {
        // Tuesday, Oct 20, 2026; weekly plans move to the first Thursday from today.
        #expect(weekdayOf("2026-10-20") == 2)
        #expect(weekdayOf("2026-10-25") == 0)
        let row = try planDayUpdate(
            plan("a", tech: nil, created: "x"), from: nil, to: 4, tech: "luis", today: "2026-10-20")
        #expect(row.table == "service_plan")
        #expect(row.values["starts_on"] == .string("2026-10-22"))
        #expect(row.values["assigned_user_id"] == .string("luis"))
        #expect(
            planMovedBanner("Rivera", weekdayNames[4], "Luis") == "Rivera is now on Thursdays with Luis")
    }

    @Test func dragItemsTellPlansFromStops() {
        #expect(planDragId(planDragItem("p1")) == "p1")
        #expect(planDragId("0192-job") == nil)
    }

    @Test func suggestDaysSaysWhyItLeftSomeOut() {
        var several = plan("b", tech: nil, created: "x")
        several.location = LatLng(lat: 1, lng: 1)
        several.days = [1, 3]
        let plans = [plan("a", tech: nil, created: "x"), several]
        #expect(leftOutNote(plans, left: ["a", "b"]) == "1 has no map location · 1 is on several days a week")
        #expect(leftOutNote(plans, left: []) == nil)
        #expect(noSuggestionsMessage("1 has no map location") == "No days to suggest: 1 has no map location.")
        #expect(keptDaysMessage(1) == "Saved 1 customer’s day. Their coming visits moved too.")
    }

    @Test func teamColorsAndOrder() {
        let colors = memberColors([
            ["id": .string("m1"), "user_id": .string("dana"), "color": .string("green")],
            ["id": .string("m2"), "user_id": .string("jake"), "color": .string("navy")],
        ])
        #expect(colors == ["dana": .green, "jake": .slate])
        let m = { (name: String, active: Bool, off: String?) in
            SettingsTeamMember(
                id: name, userId: name, name: name, email: nil, value: "", isMe: false, active: active,
                disabledAt: off)
        }
        let sections = teamSections([
            m("Tony", true, nil), m("Amy", false, "2026-01-01T00:00:00Z"), m("dana", true, nil),
            m("Zed", false, "2026-10-01T00:00:00Z"),
        ])
        #expect(sections.active.map(\.name) == ["dana", "Tony"])
        #expect(sections.off.map(\.name) == ["Zed", "Amy"])
        #expect(
            TeamText.turnOffQuestion("Tony")
                == "Turn off Tony? They can’t sign in, and their coming jobs stay as they are.")
    }
}
