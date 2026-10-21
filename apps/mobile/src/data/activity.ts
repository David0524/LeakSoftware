import { useEffect, useSyncExternalStore } from "react";
import { fetchActivityUnread, markActivitySeen } from "../lib/activity";
import { getServices } from "../lib/services";
import { useSyncStatus } from "./hooks";

// The Activity dot (docs/plans/search-and-activity.md section 2): on the More tab and on the
// Activity row when there are events since this person last opened Activity (kept per person
// on the server). Asked again after each sync, at most every 30 seconds; offline it keeps the
// last answer.

const ASK_EVERY_MS = 30_000;
const unread = new Map<string, boolean>();
const askedAt = new Map<string, number>();
const asking = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function set(companyId: string, value: boolean) {
  if (unread.get(companyId) === value) return;
  unread.set(companyId, value);
  for (const fn of listeners) fn();
}

/** Ask the server whether there is something new (skipped if asked in the last 30 seconds). */
export async function refreshActivityUnread(companyId: string, force = false): Promise<void> {
  const last = askedAt.get(companyId) ?? 0;
  if (asking.has(companyId) || (!force && Date.now() - last < ASK_EVERY_MS)) return;
  asking.add(companyId);
  askedAt.set(companyId, Date.now());
  try {
    set(companyId, await fetchActivityUnread(getServices().supabase, companyId));
  } catch {
    // Offline: keep what we knew.
  } finally {
    asking.delete(companyId);
  }
}

/** Activity was opened: the dot goes now, and the server records it. */
export async function seeActivity(companyId: string): Promise<void> {
  set(companyId, false);
  try {
    await markActivitySeen(getServices().supabase);
    askedAt.set(companyId, Date.now());
  } catch {
    // Not recorded (offline): the next check brings the dot back if there's still news.
  }
}

/** Whether to show the dot, refreshed after each sync. */
export function useActivityUnread(companyId: string): boolean {
  const lastSyncedAt = useSyncStatus().lastSyncedAt;
  useEffect(() => {
    if (companyId) void refreshActivityUnread(companyId);
  }, [companyId, lastSyncedAt]);
  return useSyncExternalStore(subscribe, () => unread.get(companyId) ?? false);
}
