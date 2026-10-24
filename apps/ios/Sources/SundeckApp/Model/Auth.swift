import Foundation
import SundeckCore
import Supabase

/// Who is signed in, as the app needs it.
public struct SignedInUser: Codable, Equatable, Sendable {
    public var id: String
    public var email: String

    public init(id: String, email: String) {
        self.id = id
        self.email = email
    }
}

/// What a sign-in produced: the user, and whether they still owe a two-step code (their account
/// has an authenticator and this session hasn't passed it: aal1 where aal2 is possible).
public struct SignInResult: Equatable, Sendable {
    public var user: SignedInUser
    public var needsCode: Bool
}

/// Sign-in as the app uses it, so the session logic can be tested without a server. Port of the
/// Supabase calls in apps/mobile/src/state/session.tsx.
public protocol AuthBackend: Sendable {
    /// The stored session's user and two-step state, refreshing the token when online. Nil when
    /// there's no session at all.
    func currentSession() async -> SignInResult?
    func signIn(email: String, password: String) async throws -> SignInResult
    /// False when the account must confirm its email first (no session yet). `heardFrom`: the
    /// answer to "How did you hear about us?" (an option key), kept with the account.
    func signUp(name: String, email: String, password: String, heardFrom: String?, heardFromOther: String?)
        async throws -> Bool
    func verifyCode(_ code: String) async throws
    /// Refreshes the access token; throws when the sign-in is no longer accepted, or an error
    /// whose text `isConnectionError` matches when only the network failed.
    func refresh() async throws
    /// Ends this phone's session only.
    func signOut() async
}

/// A sign-in problem in the words the app shows.
public struct AuthMessage: Error, Equatable, CustomStringConvertible {
    public let description: String

    public init(_ text: String) { description = text }

    /// The phone couldn't reach the server (`isConnectionError` matches it).
    public static let noConnection = AuthMessage("No connection. Connect to the internet to sign in.")

    /// Supabase's messages, reworded (`friendlyAuthError` in session.tsx).
    public static func friendly(_ message: String) -> AuthMessage {
        let lower = message.lowercased()
        if lower.contains("invalid login credentials") { return AuthMessage("That email and password don't match.") }
        if lower.contains("already registered") || lower.contains("already exists") {
            return AuthMessage("An account with this email already exists. Sign in instead.")
        }
        // Supabase's own check of the password rules (owner, 2026-10-24).
        if lower.contains("password"),
            lower.contains("least") || lower.contains("short") || lower.contains("characters")
                || lower.contains("weak") || lower.contains("contain")
        {
            let rule = passwordHint.prefix(1).lowercased() + passwordHint.dropFirst()
            return AuthMessage("Choose a stronger password: \(rule)")
        }
        if lower.contains("network") || lower.contains("fetch") || lower.contains("offline")
            || lower.contains("internet") || lower.contains("timed out")
        {
            return AuthMessage("No connection. Connect to the internet to sign in.")
        }
        return AuthMessage(message)
    }
}

/// Supabase Auth through supabase-swift.
public struct SupabaseAuthBackend: AuthBackend {
    public let client: SupabaseClient

    public init(_ client: SupabaseClient) {
        self.client = client
    }

    public func currentSession() async -> SignInResult? {
        // Offline with an expired token, the stored session still says who this is.
        guard let stored = client.auth.currentSession else { return nil }
        let session = (try? await client.auth.session) ?? stored
        return SignInResult(user: user(session.user), needsCode: await needsCode())
    }

    public func signIn(email: String, password: String) async throws -> SignInResult {
        do {
            let session = try await client.auth.signIn(email: email, password: password)
            return SignInResult(user: user(session.user), needsCode: await needsCode())
        } catch {
            throw AuthMessage.friendly(message(error))
        }
    }

    public func signUp(
        name: String, email: String, password: String, heardFrom: String?, heardFromOther: String?
    ) async throws -> Bool {
        // Through the website (owner, 2026-10-24), like its own sign-up: the password rules, the
        // limit on sign-ups, and a confirmation email whose link works on any phone or computer
        // (POST /api/auth/sign-up; apps/mobile data/sign-up.ts).
        // The screen shows "By creating an account, you agree to the Terms and Privacy Policy."
        // (owner, 2026-10-24); the server records when the account agreed.
        var body: [String: JSONValue] = [
            "name": .string(name), "email": .string(email), "password": .string(password),
            "accepted_terms": .bool(true),
        ]
        if let heardFrom = parseHeardFrom(heardFrom) {
            body["heard_from"] = .string(heardFrom)
            if let other = SundeckCore.heardFromOther(heardFrom, heardFromOther) {
                body["heard_from_other"] = .string(other)
            }
        }
        let reply: JSONValue
        do {
            reply = try await WebAPI(baseURL: AppConfig.webURL) { nil }.postSignedOut(
                "api/auth/sign-up", .object(body))
        } catch {
            throw AuthMessage.friendly(String(describing: error))
        }
        if reply["confirmEmail"]?.bool != false { return false }
        // No confirmation on this server: sign straight in.
        do {
            _ = try await client.auth.signIn(email: email, password: password)
            return true
        } catch {
            throw AuthMessage.friendly(message(error))
        }
    }

    public func verifyCode(_ code: String) async throws {
        let factors: AuthMFAListFactorsResponse
        do {
            factors = try await client.auth.mfa.listFactors()
        } catch {
            throw AuthMessage.friendly(message(error))
        }
        guard let factor = factors.totp.first(where: { $0.status == .verified }) else {
            throw AuthMessage("This account has no authenticator set up. Sign in again.")
        }
        do {
            _ = try await client.auth.mfa.challengeAndVerify(
                params: MFAChallengeAndVerifyParams(factorId: factor.id, code: code))
        } catch {
            let text = message(error)
            if AuthMessage.friendly(text).description.hasPrefix("No connection") { throw AuthMessage.friendly(text) }
            throw AuthMessage("That code didn't work. Try the newest one.")
        }
    }

    public func refresh() async throws {
        do {
            _ = try await client.auth.refreshSession()
        } catch let error as Supabase.AuthError {
            // A server hiccup or a refresh overtaken by a sign-out isn't a refusal: try later.
            if case .api(_, _, _, let response) = error, response.statusCode >= 500 {
                throw AuthMessage.noConnection
            }
            if case .refreshDiscarded = error { throw AuthMessage.noConnection }
            throw error
        } catch is URLError {
            throw AuthMessage.noConnection
        }
    }

    public func signOut() async {
        try? await client.auth.signOut(scope: .local)
    }

    private func needsCode() async -> Bool {
        guard let level = try? await client.auth.mfa.getAuthenticatorAssuranceLevel() else { return false }
        return level.nextLevel == "aal2" && level.currentLevel != "aal2"
    }

    private func user(_ user: User) -> SignedInUser {
        SignedInUser(id: user.id.uuidString.lowercased(), email: user.email ?? "")
    }

    private func message(_ error: Error) -> String {
        if let error = error as? Supabase.AuthError { return error.message }
        if let error = error as? URLError { return "network \(error.code.rawValue)" }
        return String(describing: error)
    }
}
