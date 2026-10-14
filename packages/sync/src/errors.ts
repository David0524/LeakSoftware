// Failures the app treats differently from "try again later" (M11 offline edge cases).

/** The server no longer accepts this sign-in (expired, revoked, or the user was removed). */
export class AuthError extends Error {
  override name = "AuthError";
}

/** The phone is out of storage: the change was not saved (the transaction rolled back). */
export class StorageFullError extends Error {
  override name = "StorageFullError";
  constructor(
    message = "Phone storage is full. Free up some space; nothing already saved is lost.",
  ) {
    super(message);
  }
}

/** Supabase / PostgREST / auth errors that mean "sign in again", not "retry". */
export function isAuthFailure(error: {
  message?: string;
  code?: string;
  status?: number;
}): boolean {
  if (error.status === 401) return true;
  if (error.code && /^PGRST30[1-3]$/.test(error.code)) return true;
  return /jwt (expired|malformed)|invalid jwt|invalid (refresh )?token|refresh token not found|not authenticated|session (expired|not found)/i.test(
    error.message ?? "",
  );
}

/** SQLite or the file system ran out of space. */
export function isStorageFull(error: unknown): boolean {
  const text =
    error instanceof Error
      ? `${error.message} ${(error as { code?: string }).code ?? ""}`
      : String(error);
  return /SQLITE_FULL|database or disk is full|ENOSPC|no space left|not enough (free )?space|disk full/i.test(
    text,
  );
}
