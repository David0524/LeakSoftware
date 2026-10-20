import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

/// The owner's 2026-10-20 batch: settings built in the app instead of website links, address
/// changes finding the pin again, Phone and Texting, gestures, and the job page's title.
@MainActor @Suite struct NativeSettingsTests {
    func api(_ host: String, offline: Bool = false) -> WebAPI {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [offline ? NoConnection.self : StubServer.self]
        var api = WebAPI(baseURL: URL(string: "https://\(host)")!) { "token" }
        api.session = URLSession(configuration: config)
        return api
    }

    func host() -> String { "n\(UUID().uuidString.prefix(8).lowercased()).test" }

    func pending(_ store: LocalStore, _ table: String, _ id: String) throws -> Set<String> {
        let rows = try store.database.query(
            "select fields from sync_outbox where status = 'pending' and table_name = ? and row_id = ?",
            [.text(table), .text(id)])
        var keys: Set<String> = []
        for row in rows {
            guard case .text(let text)? = row["fields"],
                case .object(let o)? = try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))
            else { continue }
            keys.formUnion(o.keys)
        }
        return keys
    }

    // MARK: - Settings pages are in the app

    @Test func settingsPagesOpenInTheApp() {
        for page in [SettingsPage.company, .scheduling, .reports, .phone] { #expect(page.isNative) }
        // Payments is Stripe's onboarding; Import stays on a computer.
        #expect(!SettingsPage.payments.isNative && !SettingsPage.importCustomers.isNative)
    }

    // MARK: - Address changes find the pin again

    @Test func anAddressChangeClearsThePin() {
        let before: Row = [
            "address_line1": "1 Palm Ct", "city": "Mesa", "latitude": 33.4, "longitude": -111.8,
            "geocoded_address": "1 Palm Ct, Mesa", "location_source": "geocoder",
        ]
        let same = clearingLocation(["address_line1": " 1 Palm Ct ", "city": "Mesa", "notes": "x"], before: before)
        #expect(!same.moved && same.values["latitude"] == nil)
        let moved = clearingLocation(["address_line1": "9 Elm St", "city": "Mesa"], before: before)
        #expect(moved.moved)
        #expect(moved.values["latitude"] == .null && moved.values["longitude"] == .null)
        #expect(moved.values["geocoded_address"] == .null && moved.values["location_source"] == .null)
        // The shop has no location_source column.
        let shop = clearingLocation(["postal_code": "85201"], before: before, shop: true)
        #expect(shop.moved && shop.values["location_source"] == nil)
        // A null and an empty string are the same address.
        #expect(!clearingLocation(["address_line2": ""], before: ["address_line2": .null]).moved)
    }

    @Test func aPoolsNewAddressIsLocatedAfterTheSync() async throws {
        let s = try Shell()
        try s.seedCompany(userId: "u1", role: "owner")
        let propertyId = try s.sync.insert(
            "property", companyId: "c1", ["address_line1": "1 Palm Ct", "city": "Mesa", "has_pool": true])
        let queue = LocateQueue(kv: s.sync.kv)
        try CustomerWrites.savePool(
            s.sync, companyId: "c1", propertyId: propertyId, ["access_notes": "Gate 12"], locate: queue)
        #expect(queue.pending.isEmpty)
        try CustomerWrites.savePool(
            s.sync, companyId: "c1", propertyId: propertyId, ["address_line1": "9 Elm St"], locate: queue)
        #expect(queue.pending == [LocateRequest(companyId: "c1", propertyId: propertyId)])
        #expect(try pending(s.sync.store, "property", propertyId).isSuperset(of: ["latitude", "location_source"]))

        let host = host()
        // Offline: it waits.
        await queue.flush(api(host, offline: true))
        #expect(queue.pending.count == 1)
        StubServer.set(host, "/api/locate", 200, ["latitude": 33.4, "longitude": -111.8])
        await queue.flush(api(host))
        #expect(queue.pending.isEmpty)
        #expect(
            StubServer.calls(host).last?.body == ["company_id": "c1", "property_id": .string(propertyId)])

        // The shop: the same, with `shop: true`; a "not found" answer is final too.
        StubServer.set(host, "/api/locate", 404, ["error": "That address wasn’t found. Check it."])
        var form = CompanyProfileForm(try s.sync.store.get("company", "c1"))
        form.street = "1 Shop Way"
        try ShopSettingsWrites.saveProfile(s.sync, companyId: "c1", form, locate: queue)
        #expect(queue.pending == [LocateRequest(companyId: "c1", propertyId: nil)])
        await queue.flush(api(host))
        #expect(queue.pending.isEmpty && StubServer.calls(host).last?.body == ["company_id": "c1", "shop": true])
        #expect(try s.sync.store.get("company", "c1")?["address_line1"] == "1 Shop Way")
    }

    // MARK: - Company and Branding

    @Test func companyFormsCheckLikeTheWebsite() throws {
        var profile = CompanyProfileForm(["name": "Desert Leak", "timezone": "America/Phoenix", "state": "az"])
        #expect(profile.errors.isEmpty)
        #expect(profile.values["state"] == "AZ" && profile.values["phone"] == .null)
        profile.name = "  "
        profile.timeZone = "Mars/Olympus"
        #expect(profile.errors == ["name": "Enter the company name.", "timezone": "Pick a time zone."])
        #expect(timeZoneChoices("America/Phoenix") == usTimeZones)
        #expect(timeZoneChoices("Europe/London").first == "Europe/London")

        var followups = FollowupsForm(nil)
        #expect(followups.quoteDays == "3, 7" && followups.invoiceDays == "7, 14, 30" && followups.reviewRequests)
        followups.quoteDays = "7 3 3"
        followups.reviewRequests = false
        let settings = followups.settings(["services": "pool"])
        #expect(settings["services"] == "pool")
        #expect(settings["reminders"]?["quote_days"] == [3, 7])
        #expect(settings["review_requests"] == false)
        #expect(FollowupsForm(settings).quoteDays == "3, 7")
        followups.invoiceDays = "0"
        #expect(followups.errors == ["invoice_days": "Enter days after sending, like 7, 14, 30."])

        var branding = BrandingForm(["brand_primary": "#12263a"])
        #expect(branding.errors.isEmpty && branding.values["brand_primary"] == "#12263A")
        #expect(branding.values["brand_secondary"] == .null)
        branding.secondary = "orange"
        #expect(branding.errors == ["brand_secondary": "Use a color like #EE6A1F."])
        #expect(logoFileProblem(contentType: "image/png", bytes: 1000).ext == "png")
        #expect(logoFileProblem(contentType: "image/gif", bytes: 10).error == "Use a PNG, JPEG, or SVG file.")
        #expect(logoFileProblem(contentType: "image/jpeg", bytes: 3_000_000).error == "Use a file under 2 MB.")
        #expect(nextJobNumberProblem("10450") == nil && nextJobNumberProblem("0") != nil)
        #expect(nextJobNumberHint(lastNumber: 1042).hasPrefix("The last job is #1042."))
        #expect(reportDisclaimerProblem(String(repeating: "a", count: 20_001)) == "Keep it under 20,000 characters.")
    }

    // MARK: - Scheduling and Routes

    @Test func schedulingFormSavesTheRoutingSettings() {
        var form = SchedulingForm(["maintenance": ["cleaning_months": ["filter": 3]]])
        #expect(form.dayStart == "08:00" && form.dayEnd == "17:00" && form.jobHours == "2.5")
        #expect(form.workDays == [1, 2, 3, 4, 5] && form.visitMinutes == "30" && form.weeksAhead == "4")
        #expect(form.windowNote == "On My Way texts say “about 10:15 AM”.")
        form.windowMin = 120
        #expect(form.windowNote == "On My Way texts give a 2-hour window, like “between 10:00 AM and 12:00 PM”.")
        form.dayStart = "07:30"
        form.workDays = [6, 1]
        form.jobHours = "3"
        let settings = form.settings(["maintenance": ["cleaning_months": ["filter": 3]]])
        #expect(settings["routing"]?["day_start"] == "07:30")
        #expect(settings["routing"]?["work_days"] == [1, 6])
        #expect(settings["routing"]?["job_minutes"] == 180)
        #expect(settings["routing"]?["arrival_window_minutes"] == 120)
        #expect(settings["maintenance"]?["cleaning_months"]?["filter"] == 3)
        #expect(settings["maintenance"]?["visit_minutes"] == 30)
        form.dayEnd = "07:00"
        form.workDays = []
        form.jobHours = "20"
        #expect(form.errors["day_end"] == "End after the start.")
        #expect(form.errors["work_days"] == "Pick at least one day.")
        #expect(form.errors["job_hours"] == "Enter 0.25 to 12 hours.")
        #expect(
            shopLocationText(nil) == (
                "No address yet.", "Not on the map yet, so routes can’t count the drive from the shop."
            ))
        let located: Row = ["address_line1": "1 Shop Way", "city": "Mesa", "latitude": 33.4, "longitude": -111.8]
        #expect(shopLocationText(located).status == "On the map, from an earlier address or the shop’s GPS.")
        var same = located
        same["geocoded_address"] = "1 Shop Way, Mesa"
        #expect(shopLocationText(same).status == "On the map.")
        #expect(OnMyWayChoice(["on_my_way": "phone"]) == .phone && OnMyWayChoice(nil) == .messages)
        #expect(OnMyWayChoice.messages.label == "Sundeck Pro Messages")
    }

    // MARK: - Report templates

    @Test func reportTemplatesListAndSave() throws {
        let s = try Shell()
        try s.seedCompany(userId: "u1", role: "owner")
        try s.sync.store.applyPage(
            PullPage(
                rows: ["insurance", "homeowner", "partner"].enumerated().map { i, key in
                    PulledRow(
                        table: "report_template", xid: "5",
                        row: [
                            "id": .string("rt\(i)"), "company_id": "c1", "key": .string(key),
                            "name": .string(key.capitalized), "enabled": .bool(key == "homeowner"),
                        ])
                }, done: true, cursor: [:], serverHLC: "1760000000005-0000-srv"))
        let items = reportTemplateItems(s.sync.store, companyId: "c1")
        #expect(items.map(\.key) == ["homeowner", "insurance"])
        #expect(items.map(\.value) == ["On", "Coming soon"] && items[0].editable && !items[1].editable)
        try ShopSettingsWrites.saveReportTemplate(
            s.sync, companyId: "c1", id: "rt1", name: " Pool Owner Report ", enabled: false)
        let row = try s.sync.store.get("report_template", "rt1")
        #expect(row?["name"] == "Pool Owner Report" && row?["enabled"] == false)
    }

    // MARK: - Phone and Texting

    @Test func phoneSettingsGetANumberAndMyMobile() async throws {
        let host = host()
        StubServer.set(
            host, "/api/phone", 200,
            [
                "configured": true, "line": .null, "my_phone": "+14805550100",
                "team": [
                    ["user_id": "u1", "name": "Dana", "role": "owner", "phone": "+14805550100", "rings": true],
                    ["user_id": "u2", "name": "Sam", "role": "tech", "phone": .null, "rings": false],
                ],
                "numbers": [["number": "+14805550111", "locality": "Mesa", "region": "AZ"]],
                "message": "Saved.",
            ])
        let model = PhoneSettingsModel(api: api(host), companyId: "c1")
        await model.load()
        #expect(model.loaded && model.line == nil && model.myPhone == "(480) 555-0100")
        #expect(model.rings == ["u1"])
        #expect(PhoneText.ringLabel(model.team[1]) == "Sam · no mobile number yet")
        model.areaCode = "123"
        await model.search()
        #expect(model.fieldErrors["area_code"] != nil)
        model.areaCode = "480"
        await model.search()
        #expect(model.numbers.map(\.number) == ["+14805550111"] && model.numbers[0].place == "Mesa, AZ")
        #expect(StubServer.calls(host).last?.body == ["company_id": "c1", "action": "search", "area_code": "480"])
        await model.take("+14805550111")
        #expect(StubServer.calls(host).contains { $0.body["action"] == "take" })
        model.myPhone = "480 555 0199"
        await model.saveMyPhone()
        #expect(
            StubServer.calls(host).contains {
                $0.body == ["company_id": "c1", "action": "my_phone", "phone": "480 555 0199"]
            })
        #expect(model.result?.text == "Saved." && model.result?.error == false)
        // A form error comes back by field.
        StubServer.set(
            host, "/api/phone", 400,
            ["error": "Enter a US mobile number.", "fields": ["phone": "Enter a US mobile number."]])
        await model.saveMyPhone()
        #expect(model.fieldErrors["phone"] == "Enter a US mobile number." && model.result?.error == true)
        // Offline: says so.
        let offline = PhoneSettingsModel(api: api(host, offline: true), companyId: "c1")
        await offline.load()
        #expect(!offline.loaded && offline.result?.text == WebAPI.Failure.noConnection)
        #expect(PhoneText.needsNumber.contains("Texting needs a company number"))
    }

    @Test func phoneSettingsReadTheLine() {
        let model = PhoneSettingsModel(api: api(host()), companyId: "c1")
        model.apply([
            "line": [
                "number": "+14805550111", "status": "pending", "pictures": false, "ring_user_ids": ["u2"],
                "voicemail_greeting": "Hi",
            ],
            "team": [["user_id": "u2", "name": "Sam", "role": "tech", "phone": .null, "rings": true]],
            "my_phone": .null,
        ])
        #expect(model.line?.status == "pending" && model.line?.ringUserIds == ["u2"])
        #expect(!model.pictures && model.greeting == "Hi" && model.myPhone == "" && model.rings == ["u2"])
    }

    // MARK: - Gestures

    @Test func aSidewaysSwipeTurnsThePage() {
        #expect(
            PageSwipeRule.direction(start: CGPoint(x: 200, y: 300), translation: CGSize(width: -90, height: 10)) == 1)
        #expect(
            PageSwipeRule.direction(start: CGPoint(x: 200, y: 300), translation: CGSize(width: 90, height: -20)) == -1)
        // Too short, mostly vertical (scrolling), or from the left edge (the system's back swipe).
        #expect(
            PageSwipeRule.direction(start: CGPoint(x: 200, y: 300), translation: CGSize(width: -40, height: 0)) == 0)
        #expect(
            PageSwipeRule.direction(start: CGPoint(x: 200, y: 300), translation: CGSize(width: -90, height: 60)) == 0)
        #expect(PageSwipeRule.direction(start: CGPoint(x: 10, y: 300), translation: CGSize(width: 120, height: 0)) == 0)
        let sections = JobPageSection.sections(for: .detection)
        #expect(PageSwipeRule.page(sections, from: .details, direction: 1) == .checklist)
        #expect(PageSwipeRule.page(sections, from: .details, direction: -1) == nil)
        #expect(PageSwipeRule.page(sections, from: sections.last!, direction: 1) == nil)
    }

    /// The job page's title (owner, 2026-10-20): the customer's name, with "Job #1041" below; the
    /// Jobs rows carry the customer's phone for Call and Text.
    @Test func jobTitleIsTheCustomer() throws {
        let s = try ScheduleDataTests()
        let views = try jobViews(s.sync.store, companyId: ScheduleDataTests.company)
        let job = try #require(views.first { $0.id == s.id(1) })
        #expect(jobPageTitle(job) == "Riley Rivera" && jobNumberLine(job) == "Job #1041")
        var nameless = job
        nameless.customer = nil
        #expect(jobPageTitle(nameless) == "Job #1041" && jobNumberLine(nameless) == nil)
        let rows = jobList(
            views, filter: .all, search: "Riley", now: ScheduleDataTests.now, timeZone: "America/Phoenix",
            userId: ScheduleDataTests.me, seesAll: true, names: [:])
        #expect(rows.first?.phone == "(602) 555-0100" && rows.first?.customerId != nil)
    }
}
