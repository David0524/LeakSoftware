/**
 * When the server stops accepting a phone's sign-in (owner, 2026-10-22: "I'm getting a
 * permission denied for function sync_pull error"): which sync errors mean "signed out", the
 * sign-in screen's message, and sync errors in plain words. A raw database message such as
 * "permission denied for function sync_pull" is never shown.
 */

/** The sign-in screen's notice after the server ended this phone's sign-in. */
export const SIGNED_OUT_MESSAGE = "You were signed out. Sign in again to keep going.";

/**
 * The line under that notice when the phone still holds unsent changes: they're kept for the
 * same account and send after signing in; another account's sign-in removes them.
 */
export function signedOutNote(pending: number, email: string): string | null {
  if (!Number.isFinite(pending) || pending <= 0) return null;
  const count = pending === 1 ? "1 change" : `${Math.round(pending)} changes`;
  const who = email.trim() ? ` as ${email.trim()}` : "";
  return `${count} on this phone will sync once you sign in${who}. Signing in with another account removes them.`;
}

const SIGNED_OUT =
  /permission denied for (function|table|schema|sequence|relation)|sign in to sync|jwt (expired|malformed)|invalid jwt|invalid (refresh )?token|refresh token (not found|already used)|not authenticated|session (expired|not found|missing)|auth session missing/i;

/**
 * Whether a sync error means the request reached the server without a valid sign-in (no user
 * token, an expired or revoked one). The app then refreshes the sign-in once, and signs out on
 * this phone if that is refused.
 */
export function looksSignedOut(message: string | null | undefined): boolean {
  return SIGNED_OUT.test(message ?? "");
}

const CONNECTION =
  /network|fetch|offline|timed? ?out|could not connect|internet connection|NSURLErrorDomain|URLError|no connection/i;

/** Whether an error only means the phone couldn't reach the server (try again later). */
export function isConnectionError(message: string | null | undefined): boolean {
  return CONNECTION.test(message ?? "");
}

const STORAGE_FULL =
  /SQLITE_FULL|database or disk is full|ENOSPC|no space left|not enough (free )?space|disk full|storage is full/i;

/** A sync error in the words the app shows. Never the server's own message. */
export function syncErrorText(message: string | null | undefined): string {
  const text = message ?? "";
  if (STORAGE_FULL.test(text))
    return "Phone storage is full. Free up some space; nothing already saved is lost.";
  if (isConnectionError(text))
    return "No connection. Changes are saved on this phone and sync when it’s back.";
  if (looksSignedOut(text))
    return "The server didn’t accept this phone’s sign-in. Sign out and sign in again if this keeps happening.";
  return "Couldn’t sync with the server. Sundeck Pro will try again in a minute.";
}
