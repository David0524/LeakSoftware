import Foundation

// Errors in plain words (owner, 2026-10-26: "raw error text shown to users"). Anything a person
// can see about a failure goes through `friendlyError` or `userMessage`: a database message
// ("duplicate key value violates unique constraint"), the system's ("The operation couldn’t be
// completed"), a provider's (Stripe, Twilio) or an HTTP status ("The server said 500.") is
// replaced by a sentence that says what to do. A message the app wrote itself ("Enter the
// customer’s email.") passes through unchanged. The technical text stays in the logs and the
// Admin portal's Usage, never on screen. Port of friendly-error.ts: the same rules in the same
// order with the same words (checked by the friendly-error fixtures).

public enum FriendlyText {
    public static let alreadyExists = "That already exists."
    public static let badValue = "That isn’t a valid value. Check it and try again."
    public static let blankField = "A required field is blank."
    public static let genericError = "Something went wrong. Try again."
    public static let inUse = "That’s in use somewhere else, or it’s gone. Refresh and try again."
    public static let notAllowed = "That isn’t allowed. Check what you entered and try again."
    public static let notFound = "That wasn’t found. Refresh and try again."
    public static let noConnection = "No connection. Check your signal and try again."
    public static let noPermission = "You don’t have permission to do that."
    public static let paymentsTrouble = "Payments are having trouble right now. Try again in a moment."
    public static let phoneDatabase = "Couldn’t save on this phone. Try again."
    public static let phoneStorageFull = "Phone storage is full. Free up some space; nothing already saved is lost."
    public static let serverTrouble = "Something went wrong on our end. Try again in a moment."
    public static let signInAgain = "Your sign-in expired. Sign in again to continue."
    public static let textBadNumber = "That isn’t a number we can text. Check it and try again."
    public static let textFailed = "The text couldn’t be sent. Try again."
    public static let textOptedOut = "This customer has opted out of texts."
    public static let tooBigFile = "That file is too large."
    public static let tooLargeNumber = "That number is too large."
    public static let tooLong = "That’s too long."
    public static let tooManyTries = "Too many tries. Wait a minute and try again."
    public static let tooSlow = "That took too long. Try again."
}

/// `FRIENDLY_RULES`: a pattern (case-insensitive) and what to say instead. First match wins.
private let friendlyRules: [(pattern: String, text: String)] = [
    (
        [
            "SQLITE_FULL", "database or disk is full", "ENOSPC", "no space left",
            "not enough (free )?space", "disk full", "storage is full",
        ].joined(separator: "|"),
        FriendlyText.phoneStorageFull
    ),
    (
        [
            "failed to fetch", "fetch failed", "load failed", "network ?request failed",
            "network ?error", "net::err_", "econn(refused|reset|aborted)", "etimedout", "enotfound",
            "eai_again", "socket hang up", "internet connection appears to be offline",
            "request timed out", "(connection|operation) timed out",
            "connection (was )?(lost|reset|refused|aborted|closed)", "NSURLErrorDomain", "URLError",
            "could not connect to the server", "hostname could not be found",
        ].joined(separator: "|"),
        FriendlyText.noConnection
    ),
    ("\\b21610\\b|unsubscribed recipient", FriendlyText.textOptedOut),
    (
        [
            "21211", "21614", "not a valid phone number", "not a mobile number",
            "invalid ?'?to'? ?(phone )?number",
        ].joined(separator: "|"),
        FriendlyText.textBadNumber
    ),
    ("^not sent:|^unable to create record|twilio", FriendlyText.textFailed),
    ("^the server said (401)\\.?$", FriendlyText.signInAgain),
    ("^the server said (403)\\.?$", FriendlyText.noPermission),
    ("^the server said (404)\\.?$", FriendlyText.notFound),
    ("^the server said (413)\\.?$", FriendlyText.tooBigFile),
    ("^the server said (429)\\.?$", FriendlyText.tooManyTries),
    ("^the server said \\d{3}\\.?$", FriendlyText.serverTrouble),
    (
        [
            "jwt (expired|malformed)", "invalid jwt", "invalid (refresh )?token",
            "refresh token (not found|already used)", "not authenticated",
            "session (expired|not found|missing)", "auth session missing", "sign in to sync",
            "permission denied for (function|table|schema|sequence|relation)",
        ].joined(separator: "|"),
        FriendlyText.signInAgain
    ),
    ("unique constraint|duplicate key value", FriendlyText.alreadyExists),
    ("row-level security|violates row level", FriendlyText.noPermission),
    ("not-null constraint|null value in column|NOT NULL constraint", FriendlyText.blankField),
    ("foreign key constraint", FriendlyText.inUse),
    ("check constraint|constraint failed", FriendlyText.notAllowed),
    ("value too long for type", FriendlyText.tooLong),
    ("out of range for type|numeric field overflow", FriendlyText.tooLargeNumber),
    ("invalid input syntax for type uuid", FriendlyText.notFound),
    ("invalid input syntax|invalid input value for enum|malformed array literal", FriendlyText.badValue),
    ("JSON object requested, multiple \\(or no\\) rows returned|\\bPGRST\\d+", FriendlyText.notFound),
    ("deadlock detected|could not serialize|canceling statement due to|lock timeout", FriendlyText.tooSlow),
    (
        [
            "^stripe said", "\\breq_[A-Za-z0-9]{6,}",
            "^No such (customer|price|product|subscription|account)",
            "Stripe(Invalid|API|Card|Connection|Authentication)",
        ].joined(separator: "|"),
        FriendlyText.paymentsTrouble
    ),
    (
        [
            "internal server error", "bad gateway", "service unavailable", "gateway time-?out",
            "FUNCTION_INVOCATION", "error occurred in the server components render",
            "unexpected token '?<", "is not valid JSON", "unexpected end of JSON",
            "\\b(relation|column|function|table|schema) .* does not exist",
            "could not find the .* in the schema cache", "syntax error at or near",
            "could not find the function",
        ].joined(separator: "|"),
        FriendlyText.serverTrouble
    ),
    ("UNIQUE constraint failed", FriendlyText.alreadyExists),
    ("SQLite|database is locked", FriendlyText.phoneDatabase),
    (
        [
            "Error Domain=", "NSError", "couldn.t be completed",
            "^(Type|Reference|Range|Syntax|Eval|URI)Error\\b", "\\n\\s+at ", "DecodingError",
            "keyNotFound\\(|typeMismatch\\(|valueNotFound\\(|dataCorrupted\\(|^[A-Za-z0-9_.]+\\(.*\\)$",
        ].joined(separator: "|"),
        FriendlyText.genericError
    ),
]

/// What to show a person for an error's words: a plain sentence, never database, system or
/// provider text. The app's own sentences pass through; `fallback` is for no words at all.
public func friendlyError(_ raw: String?, fallback: String = FriendlyText.genericError) -> String {
    var text = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    // "Error: …" and "TypeError: …" read as the message they carry.
    if let prefix = text.range(of: "^(Error|[A-Z][A-Za-z]*Error)\\s*:\\s*", options: .regularExpression) {
        text = String(text[prefix.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
    }
    if text.isEmpty { return fallback }
    for rule in friendlyRules {
        if text.range(of: rule.pattern, options: [.regularExpression, .caseInsensitive]) != nil { return rule.text }
    }
    // A code name ("invalidDate") or a wall of text isn't something to read out.
    if text.rangeOfCharacter(from: .whitespacesAndNewlines) == nil || text.count > 240 || text.contains("\n") {
        return FriendlyText.genericError
    }
    return text
}

/// What to show a person for a caught `Error`: our own errors say what they mean (their
/// description); anything else (a URLError, a decoding error, the database's) is put in plain words.
public func userMessage(_ error: Error, fallback: String = FriendlyText.genericError) -> String {
    if let localized = (error as? LocalizedError)?.errorDescription {
        return friendlyError(localized, fallback: fallback)
    }
    return friendlyError(String(describing: error), fallback: fallback)
}
