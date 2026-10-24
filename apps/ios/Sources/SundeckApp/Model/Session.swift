import Foundation
import Observation
import SundeckCore
import SundeckSync

/// A company this person belongs to, from the phone's synced rows.
public struct CompanyContext: Equatable, Sendable {
    public var id: String
    public var name: String
    public var timeZone: String
    public var settings: JSONValue
    /// owner, admin or tech.
    public var role: String

    public var services: Services { companyServices(settings) }
}

/// Which part of the app to show.
public enum AppRoute: Equatable, Sendable {
    case signedOut
    /// Signed in with a password; the account's two-step code is still owed.
    case code
    /// Signed in, but this phone has no company yet (first download, or an invite to accept).
    case setup
    /// The owner of a shop whose setup (the card for the trial) isn't finished (owner, 2026-10-24).
    case finishSetup
    case ready
}

/// What asking the server about the shop's setup found (Check Again).
public enum SetupCheck: Equatable, Sendable {
    case done, needed, offline, failed
}

/// Who is signed in and in which company. The user is remembered on the phone, so an offline
/// phone with an expired token keeps working. Port of apps/mobile/src/state/session.tsx.
@MainActor @Observable
public final class Session {
    public private(set) var user: SignedInUser?
    public private(set) var needsCode = false
    public private(set) var companies: [CompanyContext] = []
    public private(set) var activeCompanyId: String?

    @ObservationIgnored public let sync: SyncService
    @ObservationIgnored private let auth: any AuthBackend

    /// The account the server signed out on this phone, while its work waits here for it to sign
    /// in again (owner, 2026-10-22). Sign In shows `signedOutMessage` and fills in its email.
    public private(set) var signedOutUser: SignedInUser?

    /// Companies last seen needing setup by this person, kept on the phone so an offline launch
    /// opens the same way (KVKey.setupNeeded).
    public private(set) var setupNeeded: [String] = []
    /// public.company_access for a company: whether it's set up, and its plan. Set by the app.
    @ObservationIgnored public var fetchAccess: (@Sendable (String) async throws -> SetupAccess)?

    public init(sync: SyncService, auth: any AuthBackend) {
        self.sync = sync
        self.auth = auth
        user = sync.kv.getJSON(KVKey.user, as: SignedInUser.self)
        signedOutUser = user == nil ? sync.kv.getJSON(KVKey.signedOutUser, as: SignedInUser.self) : nil
        activeCompanyId = sync.kv.get(KVKey.activeCompany)
        setupNeeded = sync.kv.getJSON(KVKey.setupNeeded, as: [String].self) ?? []
        reloadCompanies()
        sync.sessionEnded = { [weak self] in await self?.sessionEnded() }
    }

    /// Sign In's notice after the server ended this phone's sign-in, with what happens to unsent
    /// changes; nil otherwise.
    public var signedOutNotice: (message: String, note: String?)? {
        guard let signedOutUser, user == nil else { return nil }
        return (signedOutMessage, signedOutNote(pending: sync.status.pending, email: signedOutUser.email))
    }

    public var route: AppRoute {
        if needsCode { return .code }
        guard user != nil else { return .signedOut }
        guard company != nil else { return .setup }
        return setupHeld ? .finishSetup : .ready
    }

    /// The owner of a shop whose setup isn't finished: the app shows Finish Setting Up Your
    /// Account, as the website sends them to its trial page. Admins and techs are never held
    /// (core `mustFinishSetup`). Port of `setupHeld` in apps/mobile/src/state/session.tsx.
    public var setupHeld: Bool {
        guard let company else { return false }
        return company.role == "owner" && setupNeeded.contains(company.id)
    }

    /// Asks the server whether this person must finish the shop's setup, and remembers the answer
    /// (on opening the app, returning to it, and Check Again). Offline, the last answer stands;
    /// never asked, the person is let in, and the database still refuses changes to a shop that
    /// needs its card. Port of checkSetup in apps/mobile/src/lib/setupGate.ts.
    @discardableResult
    public func checkSetup() async -> SetupCheck {
        guard user != nil, !needsCode, let company, let fetchAccess else { return .done }
        let id = company.id
        guard company.role == "owner" else {
            saveSetupNeeded(setupNeeded.filter { $0 != id })
            return .done
        }
        let access: SetupAccess
        do {
            access = try await fetchAccess(id)
        } catch {
            return isConnectionError(String(describing: error)) ? .offline : .failed
        }
        let needed = mustFinishSetup(access, role: company.role)
        let others = setupNeeded.filter { $0 != id }
        saveSetupNeeded(needed ? others + [id] : others)
        return needed ? .needed : .done
    }

    private func saveSetupNeeded(_ ids: [String]) {
        setupNeeded = ids
        if ids.isEmpty { sync.kv.remove(KVKey.setupNeeded) } else { sync.kv.setJSON(KVKey.setupNeeded, ids) }
    }

    public var company: CompanyContext? {
        companies.first { $0.id == activeCompanyId } ?? companies.first
    }

    // MARK: - Launch and foreground

    /// At launch: start syncing for a remembered user, then check the stored session (two-step
    /// may have been turned on from the website).
    public func launch() async {
        if user != nil { sync.start() }
        await checkSession()
    }

    /// Back in the foreground: same check as at launch.
    public func checkSession() async {
        guard let current = await auth.currentSession() else { return }
        if current.needsCode {
            sync.stop()
            needsCode = true
        } else if !needsCode {
            remember(current.user)
        }
    }

    // MARK: - Sign in and out

    public func signIn(email: String, password: String) async throws {
        let result = try await auth.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
        if result.needsCode {
            sync.stop()
            needsCode = true
        } else {
            remember(result.user)
            sync.syncSoon(0)
        }
    }

    /// Creates an account. False means the person must confirm their email first. `heardFrom`:
    /// the answer to "How did you hear about us?", kept with the account for its shop.
    public func signUp(
        name: String, email: String, password: String, heardFrom: String? = nil, heardFromOther: String? = nil
    ) async throws -> Bool {
        let hasSession = try await auth.signUp(
            name: name.trimmingCharacters(in: .whitespaces), email: email.trimmingCharacters(in: .whitespaces),
            password: password, heardFrom: heardFrom, heardFromOther: heardFromOther)
        if hasSession, let current = await auth.currentSession() { remember(current.user) }
        return hasSession
    }

    /// The 6-digit code from the person's authenticator app.
    public func verifyCode(_ code: String) async throws {
        let digits = code.filter { !$0.isWhitespace }
        guard digits.wholeMatch(of: /\d{6}/) != nil else { throw AuthMessage("Enter the 6-digit code.") }
        try await auth.verifyCode(digits)
        needsCode = false
        if let current = await auth.currentSession() { remember(current.user) }
        sync.syncSoon(0)
    }

    /// Gives up on the code: signs out.
    public func cancelCode() async {
        needsCode = false
        await signOut()
    }

    /// Removes this person's work from the phone and ends the session here. Screens warn about
    /// unsent changes first.
    /// Runs first when signing out, while the person is still signed in: this phone's push token
    /// comes off the server and the Live Activity ends.
    @ObservationIgnored public var willSignOut: (@MainActor () async -> Void)?

    public func signOut() async {
        await willSignOut?()
        sync.clearLocalData()
        sync.kv.remove(KVKey.user)
        user = nil
        signedOutUser = nil
        activeCompanyId = nil
        companies = []
        setupNeeded = []
        await auth.signOut()
    }

    /// The server refused this phone's sign-in and a refresh didn't help (signed out on the
    /// website before 2026-10-22, a changed password, a removed account): end the session on this
    /// phone only and show Sign In. The phone's data and unsent changes stay for the same account,
    /// which sends them after signing in; another account's sign-in clears them first, so one
    /// person's changes never go up as someone else's.
    public func sessionEnded() async {
        guard let current = user else { return }
        sync.stop()
        sync.kv.setJSON(KVKey.signedOutUser, current)
        sync.kv.remove(KVKey.user)
        signedOutUser = current
        user = nil
        needsCode = false
        companies = []
        await auth.signOut()
    }

    /// Signs in again with the same email after the session expired. Nothing on the phone changes.
    public func signInAgain(password: String) async throws {
        guard let user else { return }
        try await signIn(email: user.email, password: password)
        await sync.syncNow()
    }

    // MARK: - Company

    public func setActiveCompany(_ id: String) {
        activeCompanyId = id
        sync.kv.set(KVKey.activeCompany, id)
    }

    /// Re-reads memberships and companies from the phone's rows (after each sync).
    public func reloadCompanies() {
        guard let user else {
            companies = []
            return
        }
        let memberships = ((try? sync.store.list("membership")) ?? []).filter {
            $0["user_id"]?.string == user.id && $0["status"]?.string == "active"
        }
        let rows = (try? sync.store.list("company")) ?? []
        companies = memberships.compactMap { m in
            guard let row = rows.first(where: { $0.id == m["company_id"]?.string }) else { return nil }
            return CompanyContext(
                id: row.id, name: row["name"]?.string ?? "", timeZone: row["timezone"]?.string ?? "America/Phoenix",
                settings: row["settings"] ?? [:], role: m["role"]?.string ?? "tech")
        }
    }

    private func remember(_ newUser: SignedInUser) {
        // Someone else signing in on this phone never sees the last person's work, nor sends its
        // unsent changes (including the work of one the server signed out).
        let previous = user ?? signedOutUser ?? sync.kv.getJSON(KVKey.signedOutUser, as: SignedInUser.self)
        if let previous, previous.id != newUser.id {
            sync.clearLocalData()
            setupNeeded = []
        }
        sync.kv.remove(KVKey.signedOutUser)
        signedOutUser = nil
        user = newUser
        sync.kv.setJSON(KVKey.user, newUser)
        reloadCompanies()
        sync.start()
    }
}
