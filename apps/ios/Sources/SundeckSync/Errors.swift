import SundeckStorage

// Failures the app treats differently from "try again later" (M11 offline edge cases).
// Port of errors.ts.

/// The server no longer accepts this sign-in (expired, revoked, or the user was removed).
public struct AuthError: Error, CustomStringConvertible {
    public let description: String
    public init(_ message: String) { description = message }
}

/// The phone is out of storage: the change was not saved (the transaction rolled back).
public struct StorageFullError: Error, CustomStringConvertible {
    public let description = "Phone storage is full. Free up some space; nothing already saved is lost."
    public init() {}
}

/// Supabase / PostgREST / auth errors that mean "sign in again", not "retry".
public func isAuthFailure(message: String?, code: String? = nil, status: Int? = nil) -> Bool {
    if status == 401 { return true }
    if let code, code.wholeMatch(of: /PGRST30[1-3]/) != nil { return true }
    let pattern =
        /(?i)jwt (expired|malformed)|invalid jwt|invalid (refresh )?token|refresh token not found|not authenticated|session (expired|not found)/
    return (message ?? "").firstMatch(of: pattern) != nil
}

/// SQLite or the file system ran out of space.
public func isStorageFull(_ error: Error) -> Bool {
    if error is StorageFullError { return true }
    if let error = error as? DatabaseError, error.code == 13 { return true }  // SQLITE_FULL
    let pattern = /(?i)SQLITE_FULL|database or disk is full|ENOSPC|no space left|not enough (free )?space|disk full/
    return String(describing: error).firstMatch(of: pattern) != nil
}
