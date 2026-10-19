import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { Notifications } from "./push";
import { getServices } from "./services";

// What the current stop's ongoing notification (features/today/LiveStop.tsx) remembers on this
// phone, across restarts: an On My Way tap (that stop is on the way, arriving then), and the
// day the tech swiped the notification away (it stays away until the next work day). Which
// stop it shows comes from the day's route itself (owner, 2026-10-19: "Live Activity should
// begin at the beginning of the workday").

export const LIVE_STOP_ID = "current-stop";
const KEY = "liveStop";
const DISMISSED_KEY = "liveStop:dismissedOn";

export interface LiveStopState {
  jobId: string;
  /** On My Way's arrival, as minutes into the shop's day. */
  arriveMin: number | null;
}

const listeners = new Set<() => void>();
let current: LiveStopState | null | undefined;
let dismissed: string | null | undefined;
let version = 0;

function read(): LiveStopState | null {
  if (current !== undefined) return current;
  try {
    current = JSON.parse(getServices().kv.get(KEY) ?? "null") as LiveStopState | null;
  } catch {
    current = null;
  }
  return current;
}

function changed() {
  version++;
  listeners.forEach((l) => l());
}

function write(next: LiveStopState | null) {
  current = next;
  const { kv } = getServices();
  if (next) kv.set(KEY, JSON.stringify(next));
  else kv.remove(KEY);
  changed();
}

/** The On My Way tap, if any. */
export function liveOnMyWay(): LiveStopState | null {
  return read();
}

/** The shop-local day the notification was swiped away, if any. */
export function liveDismissedOn(): string | null {
  if (dismissed === undefined) dismissed = getServices().kv.get(DISMISSED_KEY) ?? null;
  return dismissed;
}

/** The tech swiped it away: it stays away until the next work day. */
export function dismissLiveStopFor(day: string) {
  dismissed = day;
  getServices().kv.set(DISMISSED_KEY, day);
  changed();
}

/**
 * On My Way: this stop is on the way, arriving at `arriveMin`. A tap is a request to see it,
 * so it also brings back a notification swiped away today.
 */
export function startLiveStop(jobId: string, arriveMin: number | null) {
  dismissed = null;
  getServices().kv.remove(DISMISSED_KEY);
  write({ jobId, arriveMin });
}

/** Start Job: the stop is at the pool now (its status says so); its On My Way is kept. */
export function liveStopStarted(jobId: string) {
  const now = read();
  if (now && now.jobId !== jobId) write(null);
}

/** Takes the notification down (not a dismissal: it comes back when it should show). */
export async function hideLiveStop() {
  if (Platform.OS === "web") return;
  await Notifications.dismissNotificationAsync(LIVE_STOP_ID).catch(() => undefined);
}

/** Sign out: forget this person's stop and take the notification down. */
export async function endLiveStop() {
  write(null);
  dismissed = null;
  getServices().kv.remove(DISMISSED_KEY);
  await hideLiveStop();
}

/** Re-render when the On My Way tap or the dismissal changes. */
export function useLiveStopVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => 0,
  );
}
