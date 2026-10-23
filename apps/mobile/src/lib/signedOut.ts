import type { KeyValue } from "./database";

/**
 * Who is signed in on this phone, and whose work waits here after the server ended the
 * sign-in (owner, 2026-10-22: "I'm getting a permission denied for function sync_pull
 * error"). Same keys as the iPhone app (KVKey.user, KVKey.signedOutUser).
 */
export interface SignedInUser {
  id: string;
  email: string;
}

export const USER_KEY = "session:user";
export const SIGNED_OUT_USER_KEY = "session:signed_out_user";

/** What the sync service does for these steps (lib/sync-service.ts). */
interface SyncControl {
  stop(): void;
  clearLocalData(): void;
}

function read(kv: KeyValue, key: string): SignedInUser | null {
  try {
    const raw = kv.get(key);
    return raw ? (JSON.parse(raw) as SignedInUser) : null;
  } catch {
    return null;
  }
}

export const signedInUser = (kv: KeyValue): SignedInUser | null => read(kv, USER_KEY);

/** The account the server signed out on this phone, while its work waits here. */
export function signedOutUser(kv: KeyValue): SignedInUser | null {
  return signedInUser(kv) ? null : read(kv, SIGNED_OUT_USER_KEY);
}

/**
 * The server refused this phone's sign-in and a refresh didn't help: stop syncing and forget
 * who is signed in, but keep the phone's data and unsent changes for the same account. Returns
 * the account, or null when nobody was signed in. The caller ends the session on this phone
 * only (scope "local").
 */
export function endSignIn(kv: KeyValue, sync: SyncControl): SignedInUser | null {
  const user = signedInUser(kv);
  if (!user) return null;
  sync.stop();
  kv.set(SIGNED_OUT_USER_KEY, JSON.stringify(user));
  kv.remove(USER_KEY);
  return user;
}

/**
 * Someone signed in. A different account than the last one (signed in, or signed out by the
 * server) first clears the phone, so one person's work is never shown to, or sent as, another.
 */
export function rememberSignIn(kv: KeyValue, sync: SyncControl, user: SignedInUser): void {
  const previous = signedInUser(kv) ?? read(kv, SIGNED_OUT_USER_KEY);
  if (previous && previous.id !== user.id) sync.clearLocalData();
  kv.remove(SIGNED_OUT_USER_KEY);
  kv.set(USER_KEY, JSON.stringify(user));
}

/** Signing out from the app: the phone's data is cleared, so nobody's work waits. */
export function forgetSignIn(kv: KeyValue): void {
  kv.remove(USER_KEY);
  kv.remove(SIGNED_OUT_USER_KEY);
}
