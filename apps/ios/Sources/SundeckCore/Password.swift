import Foundation

// Password rules (owner, 2026-10-24: "Stronger passwords"): at least 10 characters with an
// uppercase letter, a lowercase letter, a number and a symbol, wherever a password is set.
// Signing in never checks them, so passwords set before keep working. Supabase enforces the
// same rule. Port of packages/core/src/password.ts; the password fixtures check they match.

public let passwordMinLength = 10
/// bcrypt reads only the first 72 bytes; Supabase refuses longer passwords.
public let passwordMaxLength = 72

/// Supabase's symbol set for `password_required_characters`, backslash and colon included.
public let passwordSymbols = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~"

public struct PasswordRule: Codable, Equatable, Sendable {
    public let id: String
    public let label: String
}

/// The checklist under the field, in order.
public let passwordRules: [PasswordRule] = [
    ("length", "At least 10 characters"), ("upper", "An uppercase letter"),
    ("lower", "A lowercase letter"), ("number", "A number"), ("symbol", "A symbol, like ! ? # or %"),
].map { PasswordRule(id: $0.0, label: $0.1) }

/// The hint beside a new-password field.
public let passwordHint =
    "At least 10 characters, with an uppercase letter, a lowercase letter, a number and a symbol."

/// Which rules a password meets, keyed by rule id. Length counts Unicode scalars, as the
/// TypeScript counts code points.
public func passwordChecks(_ password: String) -> [String: Bool] {
    let scalars = password.unicodeScalars
    let symbols = Set(passwordSymbols.unicodeScalars)
    return [
        "length": scalars.count >= passwordMinLength,
        "upper": scalars.contains { $0 >= "A" && $0 <= "Z" },
        "lower": scalars.contains { $0 >= "a" && $0 <= "z" },
        "number": scalars.contains { $0 >= "0" && $0 <= "9" },
        "symbol": scalars.contains { symbols.contains($0) },
    ]
}

/// How many of the five rules are met (the meter's bar).
public func passwordScore(_ password: String) -> Int {
    passwordChecks(password).values.filter { $0 }.count
}

/// A sentence for the first thing wrong with a new password, or nil when it's fine.
public func passwordProblem(_ password: String) -> String? {
    let checks = passwordChecks(password)
    if checks["length"] != true { return "Use at least 10 characters." }
    if password.utf8.count > passwordMaxLength { return "Use 72 characters or fewer." }
    let missing = [
        ("upper", "an uppercase letter"), ("lower", "a lowercase letter"), ("number", "a number"),
        ("symbol", "a symbol"),
    ].filter { checks[$0.0] != true }.map(\.1)
    guard let last = missing.last else { return nil }
    let list = missing.count == 1 ? last : "\(missing.dropLast().joined(separator: ", ")) and \(last)"
    return "Add \(list)."
}

/// What a visitor sees once a sign-in or email limit is reached.
public func tooManyAttempts(_ kind: String) -> String {
    kind == "sign_in" || kind == "two_step"
        ? "Too many attempts. Try again in 15 minutes."
        : "Too many attempts. Try again in an hour."
}
