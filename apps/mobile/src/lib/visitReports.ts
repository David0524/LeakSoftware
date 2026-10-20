import { visitReportMode } from "@leakbook/core";
import { call } from "../data/reports";
import { API_URL } from "./config";
import { getServices } from "./services";

// Maintenance visit reports (owner, 2026-10-20: "Include manual send and auto send"). In shops
// that chose Automatic, completing a visit on this phone queues its report; once the completed
// visit has reached the server, the app asks the server to send it ({automatic: true}). The
// queue is kept on the phone, so a visit completed offline is sent when the signal is back. The
// server checks the shop's choice again and sends each visit's report once.

const KEY = "visit_report:queue";

export type VisitSendResult =
  | { skipped: string }
  | { token: string; link: string; message: string; delivered: "email" | "text" | null };

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

/** A visit was completed on this phone: send its report once it's on the server (Automatic). */
export function queueAutoVisitReport(job: { id: string; type: string }, settings: unknown) {
  if (job.type !== "maintenance" || visitReportMode(settings) !== "auto" || !API_URL) return;
  const queue = readQueue();
  if (!queue.includes(job.id)) writeQueue([...queue, job.id]);
  void flushVisitReports();
}

let running = false;

/**
 * Sends the queued automatic reports whose visits have reached the server. Never throws.
 * `pushFirst: false` when called after a sync has just finished (no second sync).
 */
export async function flushVisitReports(pushFirst = true): Promise<void> {
  if (running || !API_URL || readQueue().length === 0) return;
  running = true;
  const { sync } = getServices();
  try {
    if (pushFirst) await sync.syncNow();
    let sent = false;
    for (const jobId of readQueue()) {
      // The completed visit must be on the server first; it waits for the next sync.
      if (sync.hasPendingWrites("job", jobId)) continue;
      try {
        await call<VisitSendResult>(`/api/jobs/${jobId}/visit-report`, { automatic: true });
        sent = true;
        writeQueue(readQueue().filter((id) => id !== jobId));
      } catch (e) {
        // No connection, signed out or a server fault: try again later. A refusal from the server is final.
        const message = e instanceof Error ? e.message : "";
        if (/connection|Sign in|said 5/.test(message)) break;
        writeQueue(readQueue().filter((id) => id !== jobId));
      }
    }
    if (sent) await sync.syncNow();
  } catch {
    // Offline: the next sync tries again.
  } finally {
    running = false;
  }
}

/** Runs the queue after each finished sync (mounted once while signed in). */
export function watchVisitReports(): () => void {
  const { sync } = getServices();
  let last = sync.status.lastSyncedAt;
  void flushVisitReports();
  return sync.subscribe(() => {
    const now = sync.status.lastSyncedAt;
    if (now === last) return;
    last = now;
    void flushVisitReports(false);
  });
}
