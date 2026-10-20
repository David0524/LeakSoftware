import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { Notifications } from "./push";
import { getServices } from "./services";

// What the current stop's ongoing notification (features/today/LiveStop.tsx) remembers on this
// phone: the day the tech swiped it away (it stays away until the next work day, across
// restarts), and a stop just completed (shown done for a minute, on the notification and on
// Today's card). Which stop it shows comes from the day's route itself (owner, 2026-10-19), and
// whether that stop is on the way from the job's own On My Way (job.on_my_way_at, arrive_at,
// synced; owner, 2026-10-20), so every phone and the website agree.

export const LIVE_STOP_ID = "current-stop";
/** Where an older build kept its On My Way tap on the phone; now it's on the job. */
const OLD_KEY = "liveStop";
const DISMISSED_KEY = "liveStop:dismissedOn";

const listeners = new Set<() => void>();
let dismissed: string | null | undefined;
let justDone: string | null = null;
let version = 0;

function changed() {
  version++;
  listeners.forEach((l) => l());
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
 * On My Way was sent (it's recorded on the job). A tap is a request to see the stop, so it
 * also brings back a notification swiped away today.
 */
export function startLiveStop() {
  dismissed = null;
  getServices().kv.remove(DISMISSED_KEY);
  changed();
}

/** The stop completed in the last minute, if any (core todayHero's `justDone`). */
export function liveJustDone(): string | null {
  return justDone;
}

/** A stop was just completed (or its minute is up: null). */
export function setLiveJustDone(jobId: string | null) {
  if (justDone === jobId) return;
  justDone = jobId;
  changed();
}

/** Takes the notification down (not a dismissal: it comes back when it should show). */
export async function hideLiveStop() {
  if (Platform.OS === "web") return;
  await Notifications.dismissNotificationAsync(LIVE_STOP_ID).catch(() => undefined);
}

/** Sign out: forget this person's stop and take the notification down. */
export async function endLiveStop() {
  justDone = null;
  dismissed = null;
  getServices().kv.remove(OLD_KEY);
  getServices().kv.remove(DISMISSED_KEY);
  changed();
  await hideLiveStop();
}

/** Re-render when the dismissal, the stop just done or a stop action changes. */
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

// The notification's On My Way and Mark Complete (owner, 2026-10-20: they open the app on
// that stop and do it there): the request waits here until Today shows the stop and acts.

export type StopAction = "on_my_way" | "mark_complete";

let requested: { jobId: string; action: StopAction; nonce: number } | null = null;
let nonce = 0;

/** Asked from the notification; Today picks it up. */
export function requestStopAction(jobId: string, action: StopAction) {
  requested = { jobId, action, nonce: ++nonce };
  changed();
}

/** The stop action waiting for Today, if any (re-renders with useLiveStopVersion). */
export function pendingStopAction() {
  return requested;
}

const done = new Set<number>();

/** The stop's button takes the request: true only the first time, so it's done once. */
export function takeStopAction(n: number): boolean {
  if (done.has(n)) return false;
  done.add(n);
  return true;
}

/** The request is over (the tech moved on: another stop, another tech's day). */
export function clearStopAction(n: number) {
  if (requested?.nonce !== n) return;
  requested = null;
  changed();
}
