import Foundation

// When the server stops accepting a phone's sign-in (owner, 2026-10-22: "I'm getting a permission
// denied for function sync_pull error"): which sync errors mean "signed out", the sign-in
// screen's message, and sync errors in plain words. A raw database message such as "permission
// denied for function sync_pull" is never shown. Port of signed-out.ts.

/// The sign-in screen's notice after the server ended this phone's sign-in (`SIGNED_OUT_MESSAGE`).
public let signedOutMessage = "You were signed out. Sign in again to keep going."

/// The line under that notice when the phone still holds unsent changes: they're kept for the
/// same account and send after signing in; another account's sign-in removes them.
public func signedOutNote(pending: Int, email: String) -> String? {
    guard pending > 0 else { return nil }
    let count = pending == 1 ? "1 change" : "\(pending) changes"
    let trimmed = email.trimmingCharacters(in: .whitespaces)
    let who = trimmed.isEmpty ? "" : " as \(trimmed)"
    return "\(count) on this phone will sync once you sign in\(who). Signing in with another account removes them."
}

private let signedOutPattern = [
    "permission denied for (function|table|schema|sequence|relation)", "sign in to sync", "jwt (expired|malformed)",
    "invalid jwt", "invalid (refresh )?token", "refresh token (not found|already used)", "not authenticated",
    "session (expired|not found|missing)", "auth session missing",
].joined(separator: "|")

private let connectionPattern = [
    "network", "fetch", "offline", "timed? ?out", "could not connect", "internet connection", "NSURLErrorDomain",
    "URLError", "no connection",
].joined(separator: "|")

private let storageFullPattern = [
    "SQLITE_FULL", "database or disk is full", "ENOSPC", "no space left", "not enough (free )?space", "disk full",
    "storage is full",
].joined(separator: "|")

private func matches(_ text: String?, _ pattern: String) -> Bool {
    (text ?? "").range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
}

/// Whether a sync error means the request reached the server without a valid sign-in (no user
/// token, an expired or revoked one). The app then refreshes the sign-in once, and signs out on
/// this phone if that is refused.
public func looksSignedOut(_ message: String?) -> Bool { matches(message, signedOutPattern) }

/// Whether an error only means the phone couldn't reach the server (try again later).
public func isConnectionError(_ message: String?) -> Bool { matches(message, connectionPattern) }

/// A sync error in the words the app shows. Never the server's own message.
public func syncErrorText(_ message: String?) -> String {
    if matches(message, storageFullPattern) {
        return "Phone storage is full. Free up some space; nothing already saved is lost."
    }
    if isConnectionError(message) { return "No connection. Changes are saved on this phone and sync when it’s back." }
    if looksSignedOut(message) {
        return "The server didn’t accept this phone’s sign-in. Sign out and sign in again if this keeps happening."
    }
    return "Couldn’t sync with the server. Sundeck Pro will try again in a minute."
}
