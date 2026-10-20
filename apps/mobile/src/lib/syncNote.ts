import type { SyncStatus } from "./sync-service";

// The "waiting to sync" note (owner, 2026-10-20: "The 'needs to sync' button should only appear
// after like 5-10 seconds. Not a good look when it happens instantly and lasts for
// milliseconds"): changes and files that have waited under 8 seconds without a break don't
// show in the sync bar; it goes away as soon as nothing waits. Offline, problems, a full
// phone, and signing in again still show at once. More › Sync always shows the real state.

export const SYNC_NOTE_DELAY_MS = 8_000;

function waiting(s: Pick<SyncStatus, "pending" | "uploads">): boolean {
  return s.pending > 0 || s.uploads.waiting > 0;
}

/** `next` with `waitingSince` kept from `prev` while something waits, set when it starts. */
export function withWaitingSince(
  next: SyncStatus,
  prev: SyncStatus | null,
  now: number = Date.now(),
): SyncStatus {
  if (!waiting(next)) return next.waitingSince == null ? next : { ...next, waitingSince: null };
  const since = prev && waiting(prev) && prev.waitingSince != null ? prev.waitingSince : now;
  return next.waitingSince === since ? next : { ...next, waitingSince: since };
}

/**
 * The status the sync bar shows at `now`: waiting changes and files are left out until they
 * have waited 8 seconds (when waiting is the only thing the bar would say).
 */
export function syncBarStatus(s: SyncStatus, now: number): SyncStatus {
  return syncNoteDueAt(s, now) == null ? s : quietWaiting(s);
}

/** The status with nothing waiting, for while the note is held back. */
export function quietWaiting(s: SyncStatus): SyncStatus {
  return { ...s, pending: 0, uploads: { ...s.uploads, waiting: 0 } };
}

/** When the bar should look again (ms timestamp), or null if nothing is held back. */
export function syncNoteDueAt(s: SyncStatus, now: number): number | null {
  if (s.waitingSince == null) return null;
  const due = s.waitingSince + SYNC_NOTE_DELAY_MS;
  return due > now ? due : null;
}
