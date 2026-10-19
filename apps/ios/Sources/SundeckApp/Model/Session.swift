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
    case ready
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

    public init(sync: SyncService, auth: any AuthBackend) {
        self.sync = sync
        self.auth = auth
        user = sync.kv.getJSON(KVKey.user, as: SignedInUser.self)
        activeCompanyId = sync.kv.get(KVKey.activeCompany)
        reloadCompanies()
    }

    public var route: AppRoute {
        if needsCode { return .code }
        guard user != nil else { return .signedOut }
        return company == nil ? .setup : .ready
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

    /// Creates an account. False means the person must confirm their email first.
    public func signUp(name: String, email: String, password: String) async throws -> Bool {
        let hasSession = try await auth.signUp(
            name: name.trimmingCharacters(in: .whitespaces), email: email.trimmingCharacters(in: .whitespaces),
            password: password)
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
    public func signOut() async {
        sync.clearLocalData()
        sync.kv.remove(KVKey.user)
        user = nil
        activeCompanyId = nil
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
        // Someone else signing in on this phone never sees the last person's work.
        if let user, user.id != newUser.id { sync.clearLocalData() }
        user = newUser
        sync.kv.setJSON(KVKey.user, newUser)
        reloadCompanies()
        sync.start()
    }
}
