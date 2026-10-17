import { useSyncExternalStore } from "react";
import { seenTips } from "@leakbook/core";
import { getServices } from "../lib/services";

// Which tips this phone has shown, and whether the first-launch cards have been seen
// (walkthrough, 2026-10-16). Kept on the phone; Settings › Show Tips Again clears both.

const TIPS_KEY = "walkthrough:tips_seen";
const LAUNCH_KEY = "walkthrough:launch_seen";

const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version++;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function readSeen(): string[] {
  try {
    return seenTips(JSON.parse(getServices().kv.get(TIPS_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function useWalkthrough() {
  useSyncExternalStore(subscribe, () => version);
  const { kv } = getServices();
  const seen = readSeen();
  return {
    seen,
    launchSeen: kv.get(LAUNCH_KEY) === "1",
    dismiss(id: string) {
      if (seen.includes(id)) return;
      kv.set(TIPS_KEY, JSON.stringify([...seen, id]));
      changed();
    },
    finishLaunch() {
      kv.set(LAUNCH_KEY, "1");
      changed();
    },
    reset() {
      kv.remove(TIPS_KEY);
      kv.remove(LAUNCH_KEY);
      changed();
    },
  };
}
