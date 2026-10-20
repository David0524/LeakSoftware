import { useSyncExternalStore } from "react";
import { AppState, Share } from "react-native";
import { call } from "../data/reports";
import { API_URL } from "./config";
import { addRequest, parseRequests, removeRequest, type ReportRequest } from "./reportRequests";
import { getServices } from "./services";

// Report requests made offline (owner, 2026-10-20: one-handed use, item 6), queued the way
// automatic visit reports are (lib/visitReports.ts): kept on the phone, and after each sync the
// ones whose job, report and signatures have reached the server are sent. Send by Text then
// opens the share sheet with the link when the app is in front.

const KEY = "report_request:queue";
const listeners = new Set<() => void>();
let version = 0;

function read(): ReportRequest[] {
  return parseRequests(getServices().kv.get(KEY));
}

function write(queue: ReportRequest[]) {
  const { kv } = getServices();
  if (queue.length) kv.set(KEY, JSON.stringify(queue));
  else kv.remove(KEY);
  version++;
  listeners.forEach((l) => l());
}

/** Keep the request for when the signal is back. */
export function queueReportRequest(req: ReportRequest) {
  write(addRequest(read(), req));
}

/** The requests waiting for this job (re-renders when the queue changes). */
export function useQueuedReportRequests(jobId: string): ReportRequest[] {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => 0,
  );
  return read().filter((r) => r.jobId === jobId);
}

let running = false;

/** Sends the waiting requests whose changes are on the server. Never throws. */
export async function flushReportRequests(): Promise<void> {
  if (running || !API_URL || read().length === 0) return;
  running = true;
  const { sync } = getServices();
  let sent = false;
  try {
    for (const req of read()) {
      if (
        sync.hasPendingWrites("job", req.jobId) ||
        sync.hasPendingWrites("report", req.reportId) ||
        sync.hasPendingWrites("signature")
      )
        continue;
      try {
        if (req.kind === "finish") {
          await call(`/api/reports/${req.reportId}/finish`, { customerAway: false });
        } else {
          const r = await call<{ message: string }>(`/api/reports/${req.reportId}/send`, {
            channel: req.kind === "email" ? "email" : "sms_device",
            to: req.to,
          });
          // The text goes from the tech's phone: the share sheet, when the app is in front.
          if (req.kind === "text" && AppState.currentState === "active")
            await Share.share({ message: r.message }).catch(() => undefined);
        }
        sent = true;
        write(removeRequest(read(), req));
      } catch (e) {
        // No connection, signed out, or a server fault: later. A refusal is final.
        const message = e instanceof Error ? e.message : "";
        if (/connection|Sign in|said 5/.test(message)) break;
        write(removeRequest(read(), req));
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
export function watchReportRequests(): () => void {
  const { sync } = getServices();
  let last = sync.status.lastSyncedAt;
  void flushReportRequests();
  return sync.subscribe(() => {
    const now = sync.status.lastSyncedAt;
    if (now === last) return;
    last = now;
    void flushReportRequests();
  });
}
