import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { Notifications } from "./push";
import { getServices } from "./services";

// The stop the tech is on, for the ongoing notification (features/today/LiveStop.tsx): set by
// On My Way and Start Job, kept on this phone across restarts, cleared a minute after the stop
// is done and at sign out.

export const LIVE_STOP_ID = "current-stop";
const KEY = "liveStop";

export interface LiveStopState {
  jobId: string;
  /** On My Way's arrival, as minutes into the shop's day. */
  arriveMin: number | null;
}

const listeners = new Set<() => void>();
let current: LiveStopState | null | undefined;

function read(): LiveStopState | null {
  if (current !== undefined) return current;
  try {
    current = JSON.parse(getServices().kv.get(KEY) ?? "null") as LiveStopState | null;
  } catch {
    current = null;
  }
  return current;
}

function write(next: LiveStopState | null) {
  current = next;
  const { kv } = getServices();
  if (next) kv.set(KEY, JSON.stringify(next));
  else kv.remove(KEY);
  listeners.forEach((l) => l());
}

/** On My Way: this stop becomes the current one, driving, arriving at `arriveMin`. */
export function startLiveStop(jobId: string, arriveMin: number | null) {
  write({ jobId, arriveMin });
}

/** Start Job: this stop is the current one, at the pool (keeps an On My Way arrival). */
export function liveStopStarted(jobId: string) {
  const now = read();
  write({ jobId, arriveMin: now?.jobId === jobId ? now.arriveMin : null });
}

/** Sign out, or the done card's minute is up: the notification goes. */
export async function endLiveStop() {
  write(null);
  if (Platform.OS === "web") return;
  await Notifications.dismissNotificationAsync(LIVE_STOP_ID).catch(() => undefined);
}

export function useLiveState(): LiveStopState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => null,
  );
}
