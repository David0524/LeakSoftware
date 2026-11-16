import { call, tryAgainLater } from "../data/reports";
import { API_URL } from "./config";
import { getServices } from "./services";

// Skip Visit tells the owners and admins (owner, 2026-11-16). The skip is saved on the phone
// first; once it has reached the server, the app asks the server to push it, once. The queue is
// kept on the phone, so a visit skipped offline is announced when the signal is back. The
// server hands each skip out one time, and the daily run catches up any that never got here.

const KEY = "skip_notice:queue";

function readQueue(): string[] {
  try {
    const v = JSON.parse(getServices().kv.get(KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeQueue(ids: string[]) {
  const { kv } = getServices();
  if (ids.length) kv.set(KEY, JSON.stringify(ids));
  else kv.remove(KEY);
}

/** A visit was skipped on this phone: tell the owners once it's on the server. */
export function queueSkipNotice(jobId: string) {
  if (!API_URL) return;
  const queue = readQueue();
  if (!queue.includes(jobId)) writeQueue([...queue, jobId]);
  void flushSkipNotices();
}

let running = false;

/** Sends the queued notices whose skips have reached the server. Never throws. */
export async function flushSkipNotices(pushFirst = true): Promise<void> {
  if (running || !API_URL || readQueue().length === 0) return;
  running = true;
  const { sync } = getServices();
  try {
    if (pushFirst) await sync.syncNow();
    for (const jobId of readQueue()) {
      // The skip must be on the server first; it waits for the next sync.
      if (sync.hasPendingWrites("job", jobId)) continue;
      try {
        const r = await call<{ pending?: boolean }>(`/api/jobs/${jobId}/skipped`, {});
        // Not on the server yet: it stays queued.
        if (r.pending) continue;
        writeQueue(readQueue().filter((id) => id !== jobId));
      } catch (e) {
        // No connection, signed out or a server fault: try again later. A refusal is final.
        if (tryAgainLater(e)) break;
        writeQueue(readQueue().filter((id) => id !== jobId));
      }
    }
  } catch {
    // Offline: the next sync tries again.
  } finally {
    running = false;
  }
}

/** Runs the queue after each finished sync (mounted while a job page is open). */
export function watchSkipNotices(): () => void {
  const { sync } = getServices();
  let last = sync.status.lastSyncedAt;
  void flushSkipNotices();
  return sync.subscribe(() => {
    const now = sync.status.lastSyncedAt;
    if (now === last) return;
    last = now;
    void flushSkipNotices(false);
  });
}
