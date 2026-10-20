import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

/// Settings › Team › Profiles (owner, 2026-10-20): owners and admins keep each person's phone,
/// email, address, emergency contact and notes, as the website does.
@MainActor @Suite struct ProfilesTests {
    let sync: SyncService

    init() throws {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("profiles-\(UUID()).db").path
        let database = try Database(path: path, key: String(repeating: "7a", count: 32))
        sync = SyncService(
            store: try LocalStore.open(database), kv: try KeyValue(database), transport: FakeTransport(),
            auth: FakeAuth())
    }

    func member(_ id: String, _ user: String, _ name: String, email: String? = nil) -> SettingsTeamMember {
        SettingsTeamMember(id: id, userId: user, name: name, email: email, value: "Tech", isMe: false)
    }

    @Test func rowsForTeamMembersThenPeopleWithoutTheApp() throws {
        let team = [member("m1", "u1", "Ana Ruiz", email: "ana@example.com"), member("m2", "u2", "Ben Ortiz")]
        // Nothing yet: every member offers Add Details.
        var rows = profileRows([], team: team)
        #expect(rows.map(\.title) == ["Ana Ruiz", "Ben Ortiz"] && rows.allSatisfy { $0.value == "Add Details" })
        #expect(rows[0].memberEmail == "ana@example.com" && rows[0].userId == "u1")

        let form = PersonProfileForm(profile: nil, name: rows[0].memberName, email: rows[0].memberEmail)
        #expect(form.name == "Ana Ruiz" && form.email == "ana@example.com")
        var ana = form
        ana.name = "Ana R. Ruiz"
        ana.phone = "(602) 555-0142"
        let before = try sync.store.pendingCount()
        #expect(try ProfileWrites.save(sync, companyId: "c1", id: nil, userId: "u1", ana) == "Added Ana R. Ruiz.")
        var someone = PersonProfileForm()
        someone.name = "Zoe Park"
        someone.phone = "(480) 555-0100"
        someone.emergencyName = "  Sam Park "
        try ProfileWrites.save(sync, companyId: "c1", id: nil, userId: nil, someone)
        var carl = PersonProfileForm()
        carl.name = "Carl Diaz"
        try ProfileWrites.save(sync, companyId: "c1", id: nil, userId: nil, carl)
        // Each write is a row and its outbox entry (the sync layer).
        #expect(try sync.store.pendingCount() == before + 3)

        rows = profileRows(personProfiles(sync.store, companyId: "c1"), team: team)
        #expect(rows.map(\.title) == ["Ana R. Ruiz", "Ben Ortiz", "Carl Diaz", "Zoe Park"])
        #expect(rows[0].detail == "(602) 555-0142" && rows[0].value == nil)
        #expect(rows[1].value == "Add Details" && rows[1].profile == nil)
        #expect(rows[2].detail == "No app" && rows[3].detail == "(480) 555-0100 · No app")
        let zoe = try #require(rows[3].profile)
        #expect(zoe.userId == nil && zoe.emergencyName == "Sam Park" && zoe.notes == nil)
        let row = try #require(try sync.store.get("team_profile", zoe.id))
        #expect(row["email"] == .null && row["user_id"] == nil)

        // Edit, then Delete Profile.
        var edit = PersonProfileForm(profile: zoe)
        edit.notes = "Gate code 4821"
        #expect(try ProfileWrites.save(sync, companyId: "c1", id: zoe.id, userId: nil, edit) == "Saved.")
        #expect(try sync.store.get("team_profile", zoe.id)?["notes"] == "Gate code 4821")
        try ProfileWrites.delete(sync, id: zoe.id)
        #expect(!personProfiles(sync.store, companyId: "c1").contains { $0.id == zoe.id })
    }

    @Test func formChecksInTheWebsitesWords() {
        var form = PersonProfileForm()
        #expect(form.error == "Enter a name.")
        form.name = "  "
        #expect(form.error == "Enter a name.")
        form.name = "Ana"
        #expect(form.error == nil)
        form.email = "ana@example"
        #expect(form.error == "Enter an email like name@example.com.")
        form.email = " ana@example.com "
        #expect(form.error == nil && form.values["email"] == "ana@example.com")
        #expect(form.values["phone"] == .null && form.values["notes"] == .null)
        #expect(ProfileText.deleteConfirm == "Delete this profile? Their account and jobs stay.")
        #expect(
            ProfileText.footer
                == "Each person’s phone, email, address, emergency contact, and notes. Only owners and admins see them."
        )
    }
}

/// Phone numbers format as they're typed (owner, 2026-10-20; website phone-format.tsx).
@Suite struct PhoneTypingTests {
    /// Types `keys` one at a time at the end of the field.
    func typed(_ keys: String) -> String {
        var text = ""
        for key in keys { text = phoneTypingEdit(previous: text, raw: text + String(key)) }
        return text
    }

    @Test func formatsAsItsTyped() {
        #expect(typed("6") == "(6")
        #expect(typed("602") == "(602")
        #expect(typed("6025") == "(602) 5")
        #expect(typed("6025550142") == "(602) 555-0142")
        #expect(typed("16025550142") == "+1 (602) 555-0142")
        // Other countries and more than ten digits are left as typed.
        #expect(typed("+442079460958") == "+442079460958")
        #expect(typed("60255501421") == "(602) 555-01421")
    }

    @Test func deletingAMarkTakesTheDigitBeforeIt() {
        // Backspace at the end takes the last digit.
        #expect(phoneTypingEdit(previous: "(602) 5", raw: "(602) ") == "(602")
        // Deleting the "-" takes the 5 before it.
        #expect(phoneTypingEdit(previous: "(602) 555-0142", raw: "(602) 5550142") == "(602) 550-142")
        // Deleting the ")" takes the 2.
        #expect(phoneTypingEdit(previous: "(602) 555", raw: "(602 555") == "(605) 55")
        // A number from another country is never changed.
        #expect(phoneTypingEdit(previous: "+44 20", raw: "+4420") == "+4420")
        // Pasted in whole.
        #expect(phoneTypingEdit(previous: "", raw: "602.555.0142") == "(602) 555-0142")
    }
}

/// Address suggestions as you type (owner, 2026-10-20; website address-field.tsx).
@MainActor @Suite struct AddressSuggestTests {
    nonisolated static let found = (1...7).map {
        AddressSuggestion(
            line1: "\($0) Main St", city: "Mesa", state: "AZ", postalCode: "85201", label: "\($0) Main St, Mesa")
    }

    final class Asked: @unchecked Sendable {
        private let lock = NSLock()
        private var list: [String] = []
        var all: [String] { lock.withLock { list } }
        func add(_ q: String) { lock.withLock { list.append(q) } }
    }

    @Test func asksAfterAPauseUpToFiveAndPickingCloses() async {
        let asked = Asked()
        let s = AddressSuggester { q in
            asked.add(q)
            return Self.found
        }
        // Under 4 characters: nothing asked.
        await s.typed("1 M")
        #expect(s.items.isEmpty && asked.all.isEmpty)
        await s.typed(" 1 Main ")
        #expect(asked.all == ["1 Main"] && s.items.count == 5)
        #expect(s.items[0].cityLine == "Mesa, AZ 85201")
        #expect(s.items[0].spoken == "Suggested address, 1 Main St, Mesa, AZ 85201")
        let picked = s.pick(s.items[2])
        #expect(picked.line1 == "3 Main St" && s.items.isEmpty)
        // The picked street put in the field isn't looked up again; typing on is.
        await s.typed("3 Main St")
        #expect(asked.all.count == 1 && s.items.isEmpty)
        await s.typed("3 Main St W")
        #expect(asked.all.count == 2 && s.items.count == 5)
        s.close()
        #expect(s.items.isEmpty)
    }

    @Test func aNewerChangeCancelsTheLookup() async {
        let asked = Asked()
        let s = AddressSuggester { q in
            asked.add(q)
            return Self.found
        }
        let first = Task { await s.typed("1 Mai") }
        first.cancel()
        await first.value
        #expect(asked.all.isEmpty && s.items.isEmpty)
    }

    @Test func cityLineLeavesOutWhatsMissing() {
        #expect(AddressSuggestion(line1: "1 A St", city: "", state: "AZ", postalCode: "", label: "").cityLine == "AZ")
        #expect(
            AddressSuggestion(line1: "1 A St", city: "Mesa", state: "", postalCode: "85201", label: "").cityLine
                == "Mesa, 85201")
    }
}

/// "Not found on the map" (owner, 2026-10-20).
@MainActor @Suite struct NotOnMapTests {
    let kv: KeyValue

    init() throws {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("map-\(UUID()).db").path
        kv = try KeyValue(try Database(path: path, key: String(repeating: "3b", count: 32)))
    }

    @Test func lookupsCountAsOnWithAShopLocationOrAnAnswerOtherThan503() {
        #expect(!MapLookups.on(kv, company: ["id": "c1"]))
        #expect(MapLookups.on(kv, company: ["id": "c1", "latitude": 33.4, "longitude": -111.9]))
        MapLookups.answered(kv, status: 404)
        #expect(MapLookups.on(kv, company: ["id": "c1"]))
        MapLookups.answered(kv, status: 0)  // offline: says nothing
        #expect(MapLookups.on(kv, company: ["id": "c1"]))
        MapLookups.answered(kv, status: 503)
        #expect(!MapLookups.on(kv, company: ["id": "c1", "latitude": 33.4, "longitude": -111.9]))
    }

    @Test func aPoolWithAnAddressAndNoLocationIsMissing() {
        let pool: Row = ["id": "p1", "address_line1": "1 Main St", "city": "Mesa", "state": "AZ"]
        #expect(propertyMapStatus(pool, routing: true) == .missing)
        #expect(propertyMapStatus(pool, routing: false) == nil)
        var found = pool
        found["latitude"] = 33.4
        found["longitude"] = -111.8
        #expect(propertyMapStatus(found, routing: true) == .found)
        found["geocoded_address"] = "9 Old Rd, Mesa, AZ"
        #expect(propertyMapStatus(found, routing: true) == .missing)
        #expect(propertyMapStatus(["id": "p2"], routing: true) == nil)
        #expect(propertyMapStatus(nil, routing: true) == nil)
    }

    @Test func scheduleNotesSayNotOnMap() {
        let view = JobView(
            id: "j1", job: ["id": "j1", "type": "repair", "status": "scheduled"],
            property: ["id": "p1", "address_line1": "1 Main St"], customer: nil)
        let job = ScheduleJob(view)
        #expect(job.mapMissing)
        #expect(stopNote(job, routeTech: nil, names: [:]) == "Repair")
        #expect(stopNote(job, routeTech: nil, names: [:], routing: true) == "Repair · Not on map")
        let leak = ScheduleJob(
            JobView(
                id: "j2", job: ["id": "j2", "type": "detection", "status": "scheduled"],
                property: ["id": "p2", "address_line1": "2 Main St"], customer: nil))
        #expect(stopNote(leak, routeTech: nil, names: [:], routing: true) == "Not on map")
        #expect(stopNote(leak, routeTech: nil, names: [:]) == nil)
    }
}
