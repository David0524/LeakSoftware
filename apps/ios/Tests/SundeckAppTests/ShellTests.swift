import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

// S3's app shell without screens: session, sync service, sync bar, job list and tips.

/// A server stand-in: empty pulls, every push applied, or a chosen failure.
final class FakeTransport: SyncTransport, @unchecked Sendable {
    let lock = NSLock()
    var failure: Error?
    var pushes = 0
    var rows: [PulledRow] = []

    func push(_ mutations: [Mutation], deviceId: String) async throws -> PushResponse {
        try lock.withLock {
            if let failure { throw failure }
            pushes += 1
            return PushResponse(
                serverHLC: "1760000000000-0000-srv",
                results: mutations.map { MutationResult(id: $0.id, status: .applied) })
        }
    }

    func pull(cursor: PullCursor, pageSize: Int) async throws -> PullPage {
        try lock.withLock {
            if let failure { throw failure }
            let page = PullPage(rows: rows, done: true, cursor: ["from": "1"], serverHLC: "1760000000000-0000-srv")
            rows = []
            return page
        }
    }

    func scope() async throws -> String? { nil }
}

/// Sign-in without a server.
final class FakeAuth: AuthBackend, @unchecked Sendable {
    let lock = NSLock()
    var stored: SignInResult?
    var codeOwed = false
    var refreshWorks = true
    var signOuts = 0

    func currentSession() async -> SignInResult? { lock.withLock { stored } }

    func signIn(email: String, password: String) async throws -> SignInResult {
        try lock.withLock {
            guard password == "right" else { throw AuthMessage.friendly("Invalid login credentials") }
            let result = SignInResult(user: SignedInUser(id: "u-\(email)", email: email), needsCode: codeOwed)
            stored = result
            return result
        }
    }

    func signUp(name: String, email: String, password: String) async throws -> Bool { false }

    func verifyCode(_ code: String) async throws {
        try lock.withLock {
            guard code == "123456" else { throw AuthMessage("That code didn't work. Try the newest one.") }
            codeOwed = false
            stored?.needsCode = false
        }
    }

    func refresh() async throws {
        try lock.withLock { if !refreshWorks { throw AuthError("JWT expired") } }
    }

    func signOut() async {
        lock.withLock {
            stored = nil
            signOuts += 1
        }
    }
}

@MainActor
struct Shell {
    let transport = FakeTransport()
    let auth = FakeAuth()
    let sync: SyncService
    let session: Session

    init() throws {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("shell-\(UUID()).db").path
        let db = try Database(path: path, key: String(repeating: "ab", count: 32))
        let store = try LocalStore.open(db)
        sync = SyncService(store: store, kv: try KeyValue(db), transport: transport, auth: auth)
        session = Session(sync: sync, auth: auth)
    }

    /// A company and this user's membership, as a sync would bring them.
    func seedCompany(userId: String, role: String = "tech", settings: JSONValue = [:]) throws {
        try sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "company", xid: "1",
                        row: [
                            "id": "c1", "company_id": "c1", "name": "Demo Leak Co.", "timezone": "America/Phoenix",
                            "settings": settings,
                        ]),
                    PulledRow(
                        table: "membership", xid: "2",
                        row: [
                            "id": "m1", "company_id": "c1", "user_id": .string(userId), "role": .string(role),
                            "status": "active",
                        ]),
                ], done: true, cursor: [:], serverHLC: "1760000000000-0000-srv"))
    }
}

@Suite @MainActor struct SessionTests {
    @Test func signInWithoutACompanyGoesToSetupThenToTheApp() async throws {
        let s = try Shell()
        #expect(s.session.route == .signedOut)
        try await s.session.signIn(email: "tech@shop.test", password: "right")
        #expect(s.session.route == .setup)
        try s.seedCompany(userId: "u-tech@shop.test")
        s.session.reloadCompanies()
        #expect(s.session.route == .ready)
        #expect(s.session.company?.name == "Demo Leak Co.")
        #expect(s.session.company?.role == "tech")
    }

    @Test func aWrongPasswordSaysSo() async throws {
        let s = try Shell()
        await #expect(throws: AuthMessage("That email and password don't match.")) {
            try await s.session.signIn(email: "tech@shop.test", password: "wrong")
        }
        #expect(s.session.route == .signedOut)
    }

    @Test func aTwoStepAccountAsksForTheCodeFirst() async throws {
        let s = try Shell()
        s.auth.codeOwed = true
        try await s.session.signIn(email: "owner@shop.test", password: "right")
        #expect(s.session.route == .code)
        await #expect(throws: AuthMessage("Enter the 6-digit code.")) { try await s.session.verifyCode("12 34") }
        await #expect(throws: AuthMessage("That code didn't work. Try the newest one.")) {
            try await s.session.verifyCode("654321")
        }
        try await s.session.verifyCode("123 456")
        #expect(s.session.route == .setup)
        #expect(s.session.user?.email == "owner@shop.test")
    }

    @Test func theUserIsRememberedSoAnOfflinePhoneStaysSignedIn() async throws {
        let s = try Shell()
        try await s.session.signIn(email: "tech@shop.test", password: "right")
        // A new launch, with no session from the server (offline, token expired).
        let again = Session(sync: s.sync, auth: FakeAuth())
        #expect(again.user?.email == "tech@shop.test")
        #expect(again.route == .setup)
    }

    @Test func anotherPersonSigningInNeverSeesTheLastPersonsWork() async throws {
        let s = try Shell()
        try await s.session.signIn(email: "first@shop.test", password: "right")
        try s.seedCompany(userId: "u-first@shop.test")
        try s.sync.insert("customer", companyId: "c1", ["name": "First's customer"])
        try await s.session.signIn(email: "second@shop.test", password: "right")
        #expect(try s.sync.store.list("customer").isEmpty)
        #expect(try s.sync.store.pendingCount() == 0)
    }

    @Test func signingOutClearsThePhoneButKeepsItsIdentity() async throws {
        let s = try Shell()
        try await s.session.signIn(email: "tech@shop.test", password: "right")
        try s.seedCompany(userId: "u-tech@shop.test")
        s.session.reloadCompanies()
        let device = s.sync.store.deviceId
        s.sync.kv.set(KVKey.launchSeen, "1")
        await s.session.signOut()
        #expect(s.session.route == .signedOut)
        #expect(try s.sync.store.list("company").isEmpty)
        #expect(s.sync.kv.get(KVKey.user) == nil)
        #expect(s.sync.kv.get(KVKey.launchSeen) == nil)
        #expect(s.sync.store.deviceId == device)
        #expect(s.auth.signOuts == 1)
    }

    @Test func theChosenCompanyIsKept() async throws {
        let s = try Shell()
        try await s.session.signIn(email: "tech@shop.test", password: "right")
        try s.seedCompany(userId: "u-tech@shop.test")
        s.session.reloadCompanies()
        s.session.setActiveCompany("c1")
        #expect(Session(sync: s.sync, auth: s.auth).activeCompanyId == "c1")
    }
}

@Suite @MainActor struct SyncServiceTests {
    @Test func aWriteSavesTheRowAndOutboxAndCountsAsPending() throws {
        let s = try Shell()
        let before = s.sync.revision
        let id = try s.sync.insert("customer", companyId: "c1", ["name": "Maria"])
        #expect(try s.sync.store.get("customer", id)?["name"] == "Maria")
        #expect(s.sync.status.pending == 1)
        #expect(s.sync.revision > before)
    }

    @Test func aBatchSavesAllOrNothing() throws {
        struct Stop: Error {}
        let s = try Shell()
        #expect(throws: Stop.self) {
            try s.sync.batch {
                try s.sync.store.insert("customer", companyId: "c1", ["name": "Half"])
                throw Stop()
            }
        }
        #expect(try s.sync.store.list("customer").isEmpty)
        #expect(s.sync.status.pending == 0)
    }

    @Test func aGoodSyncSendsChangesAndRemembersWhen() async throws {
        let s = try Shell()
        try s.sync.insert("customer", companyId: "c1", ["name": "Maria"])
        await s.sync.syncNow()
        #expect(s.sync.status.phase == .idle)
        #expect(s.sync.status.pending == 0)
        #expect(s.sync.status.lastSyncedAt != nil)
        #expect(s.sync.status.initialSyncDone)
        #expect(s.transport.pushes == 1)
        #expect(s.sync.kv.get(KVKey.initialSyncDone) == "1")
    }

    @Test func noNetworkMeansOfflineAndChangesWait() async throws {
        let s = try Shell()
        try s.sync.insert("customer", companyId: "c1", ["name": "Maria"])
        s.sync.networkChanged(online: false)
        await s.sync.syncNow()
        #expect(s.sync.status.phase == .offline)
        #expect(s.sync.status.pending == 1)
        #expect(s.transport.pushes == 0)
    }

    @Test func aConnectionErrorReadsAsOfflineAndOtherErrorsAsFailures() async throws {
        let s = try Shell()
        s.transport.failure = SyncFailure("The Internet connection appears to be offline.")
        await s.sync.syncNow()
        #expect(s.sync.status.phase == .offline)
        #expect(s.sync.status.error == nil)
        s.transport.failure = SyncFailure("500 upstream broke")
        await s.sync.syncNow()
        #expect(s.sync.status.phase == .error)
        #expect(s.sync.status.error == "500 upstream broke")
    }

    @Test func anExpiredSignInIsRefreshedOnceThenReportedAsSignedOut() async throws {
        let s = try Shell()
        try s.sync.insert("customer", companyId: "c1", ["name": "Maria"])
        s.transport.failure = AuthError("JWT expired")
        s.auth.refreshWorks = false
        await s.sync.syncNow()
        #expect(s.sync.status.phase == .signedOut)
        #expect(s.sync.status.pending == 1)
    }

    @Test func clearingLocalDataLeavesNothingBehind() throws {
        let s = try Shell()
        try s.sync.insert("customer", companyId: "c1", ["name": "Maria"])
        s.sync.kv.set(KVKey.lastSyncedAt, "1")
        s.sync.clearLocalData()
        #expect(try s.sync.store.list("customer").isEmpty)
        #expect(s.sync.status.pending == 0)
        #expect(s.sync.kv.get(KVKey.lastSyncedAt) == nil)
        #expect(s.sync.status.phase == .signedOut)
    }
}

@Suite struct SyncBarTests {
    let now = Date(timeIntervalSince1970: 1_760_000_000)

    func status(_ change: (inout SyncStatus) -> Void) -> SyncStatus {
        var s = SyncStatus()
        s.lastSyncedAt = now
        change(&s)
        return s
    }

    @Test func hiddenWhenEverythingIsSaved() {
        #expect(syncBarMessage(status { _ in }, now: now) == nil)
        #expect(syncBarMessage(status { $0.phase = .syncing }, now: now) == nil)
    }

    @Test func saysWhatIsWrongInTheExpoAppsOrder() {
        #expect(
            syncBarMessage(
                status {
                    $0.problems = 2
                    $0.pending = 3
                }, now: now)?.text
                == "2 changes could not be saved · tap for details")
        #expect(
            syncBarMessage(status { $0.storageLow = true }, now: now)?.text
                == "Phone storage almost full · free up space so new work saves")
        #expect(
            syncBarMessage(
                status {
                    $0.phase = .syncing
                    $0.pending = 1
                    $0.initialSyncDone = true
                }, now: now)?.text == "Syncing…")
        // A new phone's first download, behind the app: how far along it is.
        #expect(
            syncBarMessage(
                status {
                    $0.phase = .syncing
                    $0.lastSyncedAt = nil
                }, now: now)?.text == "Downloading your company…")
        #expect(
            syncBarMessage(
                status {
                    $0.phase = .syncing
                    $0.lastSyncedAt = nil
                    $0.download = PullProgress(totals: ["customer": 10], pulled: ["customer": 4])
                }, now: now)?.text == "Downloading your company · 40%")
        #expect(
            syncBarMessage(
                status {
                    $0.phase = .offline
                    $0.pending = 1
                    $0.uploadsWaiting = 3
                }, now: now)?.text
                == "Offline · 1 change, 3 photos on this phone")
        #expect(
            syncBarMessage(status { $0.phase = .offline }, now: now)?.text == "Offline · working from this phone")
        #expect(syncBarMessage(status { $0.phase = .signedOut }, now: now)?.text == "Sign in again to sync")
        #expect(syncBarMessage(status { $0.phase = .error }, now: now)?.text == "Sync failed · will retry")
        #expect(syncBarMessage(status { $0.pending = 1 }, now: now)?.text == "1 change waiting to sync")
        #expect(
            syncBarMessage(
                status {
                    $0.uploadsWaiting = 2
                    $0.uploadsAllPhotos = false
                }, now: now)?.text
                == "2 photos and recordings waiting to upload")
        #expect(syncBarMessage(status { $0.lastSyncedAt = nil }, now: now)?.text == "Not synced yet")
        #expect(
            syncBarMessage(
                status {
                    $0.phase = .readOnly
                    $0.pending = 4
                }, now: now)?.text
                == "Read-only: the shop’s Sundeck Pro subscription isn’t paid. 4 changes kept on this phone")
    }
}

@Suite @MainActor struct JobsListTests {
    @Test func jobsJoinTheirPoolAndCustomerAndFallInTheRightSections() throws {
        let s = try Shell()
        let store = s.sync.store
        let customer = try store.insert("customer", companyId: "c1", ["name": "Maria Alvarez"])
        let property = try store.insert(
            "property", companyId: "c1",
            ["customer_id": .string(customer), "address_line1": "1423 Palm Ct", "city": "Mesa", "has_pool": true])
        let now = Date(timeIntervalSince1970: 1_760_544_000)  // 2025-10-15 16:00 UTC, 9:00 AM in Phoenix
        try store.insert(
            "job", companyId: "c1",
            ["property_id": .string(property), "status": "in_progress", "started_at": "2025-10-15T15:00:00Z"])
        try store.insert(
            "job", companyId: "c1",
            ["property_id": .string(property), "status": "scheduled", "scheduled_start": "2025-10-17T16:00:00Z"])
        try store.insert("job", companyId: "c1", ["property_id": .string(property), "status": "unscheduled"])

        let sections = jobSections(try jobViews(store, companyId: "c1"), now: now, timeZone: "America/Phoenix")
        #expect(sections.map(\.title) == ["Today", "Upcoming", "Not scheduled"])
        let today = try #require(sections.first?.jobs.first)
        #expect(today.customerName == "Maria Alvarez")
        #expect(today.address == "1423 Palm Ct, Mesa")
        #expect(today.numberText == "New")
        #expect(jobWhen(today, now: now, timeZone: "America/Phoenix") == "In progress")
        #expect(jobWhen(sections[2].jobs[0], now: now, timeZone: "America/Phoenix") == "Not scheduled")
    }
}

@Suite @MainActor struct WalkthroughTests {
    @Test func closedTipsAndTheWelcomeStaySeenUntilReset() throws {
        let s = try Shell()
        let company = CompanyContext(
            id: "c1", name: "Shop", timeZone: "America/Phoenix", settings: ["services": "leak"], role: "tech")
        let w = Walkthrough(s.sync.kv)
        let tip = try #require(w.tip(screen: "jobs", company: company))
        w.dismiss(tip.id)
        w.finishLaunch()
        let again = Walkthrough(s.sync.kv)
        #expect(again.tip(screen: "jobs", company: company)?.id != tip.id)
        #expect(again.launchSeen)
        again.reset()
        #expect(Walkthrough(s.sync.kv).tip(screen: "jobs", company: company)?.id == tip.id)
        #expect(!Walkthrough(s.sync.kv).launchSeen)
    }
}

/// The "waiting to sync" note shows only after 8 seconds of changes waiting (owner, 2026-10-20).
@Suite struct SyncNoteDelayTests {
    let start = Date(timeIntervalSince1970: 1_760_000_000)

    func waiting(pending: Int = 1, uploads: Int = 0, since: Date?) -> SyncStatus {
        var s = SyncStatus()
        s.lastSyncedAt = start
        s.pending = pending
        s.uploadsWaiting = uploads
        s.waitingSince = since
        return s
    }

    @Test func waitingStartsOnceAndEndsWhenNothingWaits() {
        let later = start.addingTimeInterval(5)
        #expect(waitingSince(waiting(since: nil), previous: nil, now: start) == start)
        #expect(waitingSince(waiting(pending: 3, since: start), previous: start, now: later) == start)
        #expect(waitingSince(waiting(pending: 0, uploads: 2, since: start), previous: start, now: later) == start)
        #expect(waitingSince(waiting(pending: 0, since: start), previous: start, now: later) == nil)
    }

    @Test func theNoteIsHeldBackForEightSeconds() {
        let s = waiting(pending: 2, since: start)
        #expect(syncBarMessage(syncBarStatus(s, now: start)) == nil)
        #expect(syncBarMessage(syncBarStatus(s, now: start.addingTimeInterval(7.9))) == nil)
        #expect(syncNoteDueAt(s, now: start.addingTimeInterval(3)) == start.addingTimeInterval(8))
        #expect(syncBarMessage(syncBarStatus(s, now: start.addingTimeInterval(8)))?.text == "2 changes waiting to sync")
        #expect(syncNoteDueAt(s, now: start.addingTimeInterval(8)) == nil)
        let files = waiting(pending: 0, uploads: 1, since: start)
        #expect(syncBarMessage(syncBarStatus(files, now: start.addingTimeInterval(1))) == nil)
        #expect(syncBarMessage(syncBarStatus(files, now: start.addingTimeInterval(9)))?.text != nil)
        // Nothing waiting: nothing held, nothing due.
        #expect(syncNoteDueAt(waiting(pending: 0, since: nil), now: start) == nil)
    }

    @Test func problemsAndOfflineStillShowAtOnce() {
        var s = waiting(pending: 1, since: start)
        s.problems = 1
        #expect(syncBarMessage(syncBarStatus(s, now: start))?.text == "1 change could not be saved · tap for details")
        var offline = waiting(pending: 1, since: start)
        offline.phase = .offline
        #expect(syncBarMessage(syncBarStatus(offline, now: start))?.text == "Offline · working from this phone")
    }

    @MainActor @Test func theServiceKeepsWhenChangesStartedWaiting() throws {
        let clock = TestClock()
        clock.now = start
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("note-\(UUID()).db").path
        let db = try Database(path: path, key: String(repeating: "cd", count: 32))
        let sync = SyncService(
            store: try LocalStore.open(db), kv: try KeyValue(db), transport: FakeTransport(), auth: FakeAuth(),
            now: { clock.now })
        #expect(sync.status.waitingSince == nil)
        _ = try sync.insert("customer", companyId: "c1", ["name": "Maria"])
        #expect(sync.status.waitingSince == start && sync.status.pending == 1)
        #expect(sync.barStatus.pending == 0)
        clock.now = start.addingTimeInterval(4)
        _ = try sync.insert("customer", companyId: "c1", ["name": "Ana"])
        #expect(sync.status.waitingSince == start && sync.barStatus.pending == 0)
        clock.now = start.addingTimeInterval(8)
        #expect(sync.barStatus.pending == 2)
    }
}
