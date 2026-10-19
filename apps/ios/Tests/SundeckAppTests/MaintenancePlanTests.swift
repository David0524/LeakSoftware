import Foundation
import SundeckCore
import SundeckSync
import Testing

@testable import SundeckApp

/// Stands in for create_service_plan: records the call and answers as the server does.
final class PlanRPC: RPCClient, @unchecked Sendable {
    var calls: [(String, JSONValue)] = []
    var reply: Result<JSONValue, any Error>

    init(reply: Result<JSONValue, any Error>) { self.reply = reply }

    func call(_ function: String, _ arguments: JSONValue) async throws -> JSONValue {
        calls.append((function, arguments))
        return try reply.get()
    }
}

/// New Job's maintenance plan (website: new-job-form.tsx and createJobAction), the plan form's
/// checks (app/actions/maintenance.ts), and a customer's plans (MaintenancePlans).
extension NewJobFormTests {
    func poolForm(role: String = "owner") -> NewJobForm {
        form(role: role, settings: ["services": "pool", "maintenance": ["visit_minutes": 45]])
    }

    @Test func repeatsShowOnlyForManagersOnMaintenance() {
        let owner = poolForm()
        #expect(owner.isMaintenance && owner.showsRepeat)
        #expect(!owner.isPlan && owner.saveTitle == "Create Job" && owner.feeLabel == "Price ($)")
        owner.repeatChoice = .weekly
        #expect(owner.isPlan && owner.isDirty)
        #expect(owner.saveTitle == "Start Plan")
        #expect(owner.feeLabel == "Price per month ($)")
        #expect(owner.feeHint == "Billed monthly with the customer's other visits.")
        #expect(owner.firstVisitHintText == "Repeats on this weekday.")
        owner.repeatChoice = .monthly
        #expect(owner.firstVisitHintText == "Repeats on this weekday in the same week each month.")
        owner.repeatChoice = .days
        #expect(owner.firstVisitHintText == "Visits start on or after this date.")
        // The shop's visit length, the first visit today.
        #expect(owner.plan.minutes == "45" && owner.plan.startsOn == owner.today)
        // Another job type is never a plan.
        owner.jobType = .repair
        #expect(!owner.showsRepeat && !owner.isPlan)

        #expect(poolForm(role: "admin").showsRepeat)
        let tech = poolForm(role: "tech")
        tech.repeatChoice = .weekly
        #expect(!tech.showsRepeat && !tech.isPlan && tech.saveTitle == "Create Job")
    }

    @Test func planShowsTheWebsitesMessages() async throws {
        let f = poolForm()
        f.repeatChoice = .days
        f.plan.days = [2]
        f.plan.startsOn = "soon"
        f.plan.time = "25:00"
        f.plan.minutes = "5"
        f.plan.endsOn = "2020-01-01"
        f.fee = "abc"
        let rpc = PlanRPC(reply: .success(.null))
        await #expect(throws: NewJobFormError.invalid) { try await f.startPlan(rpc) }
        #expect(rpc.calls.isEmpty)
        #expect(
            f.errors == ["customerName": "Enter the customer's name.", "addressLine1": "Enter the street address."])
        #expect(
            f.planErrors == [
                "weekdays": "Pick two or more days.", "startsOn": "Pick the first visit's date.",
                "time": "Pick a time.",
                "minutes": "Enter 10 to 240 minutes.", "endsOn": "End on or after the first visit.",
            ])
        #expect(f.feeError == "Enter a price like 649.")
        // The schedule's When fields don't apply to a plan.
        f.input.scheduleDate = ""
        f.hours = "0"
        f.input.customerName = "Maria"
        f.input.addressLine1 = "1 Main St"
        f.plan.days = [4, 2]
        f.plan.startsOn = "2027-01-19"
        f.plan.time = ""
        f.plan.minutes = "45"
        f.plan.endsOn = ""
        f.fee = "180"
        #expect(f.validate())
        #expect(f.errors.isEmpty && f.planErrors.isEmpty && f.feeError == nil)
    }

    @Test func startPlanCallsTheServerWithANewCustomerAndPool() async throws {
        try seedTeam()
        let f = poolForm()
        f.repeatChoice = .biweekly
        f.input.customerName = " Maria Lopez "
        f.input.customerPhone = "602-555-0101"
        f.otherEmails = "a@x.com"
        f.input.addressLine1 = "1423 Palm Ct"
        f.input.city = "Phoenix"
        f.input.state = "az"
        f.hasSpa = true
        f.accessNotes = "Gate 1234"
        f.plan.startsOn = "2027-01-19"
        f.plan.time = "10:00"
        f.plan.endsOn = "2027-06-30"
        f.techId = Self.teammate
        f.fee = "180"
        f.notes = "Dog in the yard"
        let rpc = PlanRPC(reply: .success(["plan": "p1", "customer": "c9", "property": "pr9"]))

        let customer = try await f.startPlan(rpc)

        #expect(customer == "c9")
        #expect(rpc.calls.count == 1)
        let (function, args) = try #require(rpc.calls.first)
        #expect(function == "create_service_plan")
        #expect(args["target_company"] == .string(Self.company))
        #expect(args["existing_customer"] == .null && args["existing_property"] == .null)
        #expect(
            args["new_customer"] == [
                "name": "Maria Lopez", "phone": "602-555-0101", "email": nil, "cc_emails": ["a@x.com"],
            ])
        #expect(
            args["new_property"] == [
                "address_line1": "1423 Palm Ct", "city": "Phoenix", "state": "AZ", "postal_code": nil,
                "pool_type": nil, "has_spa": true, "access_notes": "Gate 1234",
            ])
        #expect(
            args["plan"] == [
                "assigned_user_id": .string(Self.teammate), "starts_on": "2027-01-19", "interval_weeks": 2,
                "weekdays": nil, "monthly": false, "visit_time": "10:00", "duration_minutes": 45, "price_cents": 18000,
                "ends_on": "2027-06-30", "notes": "Dog in the yard",
            ])
        // Nothing is written on the phone: the rows come back by sync.
        #expect(try list("customer").isEmpty)
        #expect(try list("service_plan").isEmpty)
        #expect(sync.status.pending == 0)
    }

    @Test func startPlanForAnExistingPool() async throws {
        let (customer, property) = try seedCustomer(spa: false)
        let f = poolForm()
        f.mode = .existing
        f.selectCustomer(customer)
        f.repeatChoice = .monthly
        let rpc = PlanRPC(
            reply: .success(["plan": "p1", "customer": .string(customer), "property": .string(property)]))
        #expect(try await f.startPlan(rpc) == customer)
        let args = try #require(rpc.calls.first?.1)
        #expect(args["existing_customer"] == .string(customer) && args["existing_property"] == .string(property))
        #expect(args["new_customer"] == .null && args["new_property"] == .null)
        #expect(args["plan"]?["monthly"] == true && args["plan"]?["price_cents"] == .null)
        #expect(args["plan"]?["assigned_user_id"] == .null)
    }

    @Test func startPlanSaysWhenOfflineOrRefused() async throws {
        let f = poolForm()
        f.repeatChoice = .weekly
        f.input.customerName = "Maria"
        f.input.addressLine1 = "1 Main St"
        await #expect(throws: NewJobFormError.offline) {
            try await f.startPlan(PlanRPC(reply: .failure(URLError(.notConnectedToInternet))))
        }
        #expect(
            NewJobFormError.offline.description
                == "You’re offline. Starting a plan needs a connection; try again once you’re back online.")
        await #expect(throws: NewJobFormError.server("Only owners and admins can start maintenance plans")) {
            try await f.startPlan(
                PlanRPC(reply: .failure(RPCError(message: "Only owners and admins can start maintenance plans"))))
        }
        // A tech can't start one at all.
        let tech = poolForm(role: "tech")
        tech.repeatChoice = .weekly
        await #expect(throws: NewJobFormError.notAllowed) { try await tech.startPlan(PlanRPC(reply: .success(.null))) }
    }

    // MARK: - A customer's plans

    @Test func planDraftChecksLikeTheWebsite() throws {
        var d = PlanDraft.new(today: "2026-10-19", settings: ["maintenance": ["visit_minutes": 60]])
        #expect(d.repeats == .weekly && d.minutes == "60" && d.startsOn == "2026-10-19")
        d.price = "-1"
        d.minutes = "30.5"
        d.endsOn = "2026-10-01"
        #expect(
            d.check()
                == .failure(
                    PlanDraftErrors(fields: [
                        "price": "Enter a price like 180.", "minutes": "Enter 10 to 240 minutes.",
                        "endsOn": "End on or after the start.",
                    ])))
        d.price = "$1,234.50"
        d.minutes = " 30 "
        d.endsOn = ""
        d.time = "07:30"
        d.notes = "  "
        d.repeats = .days
        d.days = [5, 1, 1]
        #expect(
            d.check()
                == .success([
                    "assigned_user_id": nil, "starts_on": "2026-10-19", "interval_weeks": 1, "weekdays": [1, 5],
                    "monthly": false, "visit_time": "07:30", "duration_minutes": 30, "price_cents": 123450,
                    "ends_on": nil, "notes": nil,
                ]))

        // An existing plan's values come back into the form.
        let plan = ServicePlan(
            assignedUserId: "u1", startsOn: "2026-10-20", intervalWeeks: 2, visitTime: "10:00:00", durationMinutes: 45,
            priceCents: 18000, endsOn: "2027-01-01", notes: "Gate")
        #expect(
            PlanDraft(plan)
                == PlanDraft(
                    repeats: .biweekly, startsOn: "2026-10-20", time: "10:00", minutes: "45", price: "180.00",
                    endsOn: "2027-01-01", tech: "u1", notes: "Gate"))
    }

    @Test func customerPageListsAndEditsPlans() throws {
        try seedTeam()
        let (customer, property) = try seedCustomer(spa: false)
        let plan = "00000000-0000-4000-8000-000000000501"
        try sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "service_plan", xid: "3",
                        row: [
                            "id": .string(plan), "company_id": .string(Self.company), "customer_id": .string(customer),
                            "property_id": .string(property), "assigned_user_id": .string(Self.teammate),
                            "starts_on": "2027-01-19", "interval_weeks": 1, "weekdays": nil, "monthly": false,
                            "visit_time": "10:00:00", "duration_minutes": 30, "price_cents": 18000, "ends_on": nil,
                            "paused": false, "notes": "Dog in the yard", "deleted_at": nil,
                            "created_at": "2027-01-01T00:00:00Z",
                        ]),
                    PulledRow(
                        table: "job", xid: "3",
                        row: [
                            "id": "00000000-0000-4000-8000-000000000601", "company_id": .string(Self.company),
                            "type": "maintenance", "status": "done", "property_id": .string(property),
                            "bill_to_customer_id": .string(customer), "service_plan_id": .string(plan),
                            "deleted_at": nil,
                        ]),
                ], done: true, cursor: [:], serverHLC: "1800000000002-0000-server"))
        let detail = try #require(
            customerDetail(
                sync.store, companyId: Self.company, customerId: customer, names: [Self.teammate: "Tony Tech"],
                now: Self.now, timeZone: "America/Phoenix"))
        let shown = try #require(detail.pools.first?.plans.first)
        #expect(shown.summary == "Every Tuesday · 10:00 AM · 30 min · $180.00 a month")
        #expect(shown.detail == "Tony Tech · Next Tue, Jan 19, Tue, Jan 26, Tue, Feb 2 · 1 done")
        #expect(shown.notes == "Dog in the yard")

        // Pause, change, and end it through the sync layer.
        #expect(
            try PlanWrites.setPaused(sync, companyId: Self.company, planId: plan, true)
                == "Paused. Upcoming visits are off the schedule.")
        var draft = PlanDraft(shown.plan)
        draft.repeats = .monthly
        draft.endsOn = "2027-06-30"
        let values = try draft.check().get()
        let saved = try PlanWrites.save(
            sync, companyId: Self.company, planId: plan, customerId: customer, propertyId: property, values)
        #expect(saved.message == "Plan saved. Upcoming visits updated.")
        let row = try #require(try sync.store.get("service_plan", plan))
        #expect(row["paused"] == true && row["monthly"] == true && row["ends_on"] == "2027-06-30")
        let paused = try #require(
            customerDetail(
                sync.store, companyId: Self.company, customerId: customer, names: [Self.teammate: "Tony Tech"],
                now: Self.now, timeZone: "America/Phoenix")?.pools.first?.plans.first)
        #expect(paused.summary == "Monthly on the 3rd Tuesday · 10:00 AM · 30 min · $180.00 a month")
        #expect(paused.detail == "Tony Tech · Paused · Ends Wed, Jun 30 · 1 done")

        // A new plan on the same pool.
        let added = try PlanWrites.save(
            sync, companyId: Self.company, planId: nil, customerId: customer, propertyId: property,
            try PlanDraft.new(today: "2027-01-15", settings: [:]).check().get())
        #expect(added.message == "Plan added. Visits are on the schedule.")
        let new = try #require(try sync.store.get("service_plan", added.id))
        #expect(new["customer_id"] == .string(customer) && new["paused"] == false && new["interval_weeks"] == 1)

        #expect(try PlanWrites.end(sync, planId: plan) == "Plan ended.")
        let after = customerDetail(
            sync.store, companyId: Self.company, customerId: customer, now: Self.now, timeZone: "America/Phoenix")
        #expect(after?.pools.first?.plans.map(\.id) == [added.id])
        #expect(
            after?.pools.first?.plans.first?.detail
                == "No tech yet · Next Fri, Jan 15, Fri, Jan 22, Fri, Jan 29 · 0 done")
    }
}
