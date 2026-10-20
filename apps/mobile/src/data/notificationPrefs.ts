import { useCallback, useEffect, useState } from "react";
import { NOTIFICATION_KINDS, notificationOn, type NotificationKind } from "@leakbook/core";
import { API_URL } from "../lib/config";
import { getServices } from "../lib/services";
import { getJson } from "./weather";

// Which notifications this person gets (More › Notifications, owner 2026-10-19), from the
// website's /api/push/preferences: kept on their profile on the server, not synced.

type Prefs = Record<string, unknown>;
let cached: Prefs | null = null;
const listeners = new Set<(p: Prefs) => void>();
/** The last choices seen, kept on this phone so the Live Activity switch holds offline. */
const KV_KEY = "notification_prefs";

function remembered(): Prefs | null {
  if (cached) return cached;
  try {
    const raw = getServices().kv.get(KV_KEY);
    cached = raw ? (JSON.parse(raw) as Prefs) : null;
  } catch {
    cached = null;
  }
  return cached;
}

function remember(p: Prefs) {
  cached = p;
  try {
    getServices().kv.set(KV_KEY, JSON.stringify(p));
  } catch {
    // Kept in memory only.
  }
  listeners.forEach((l) => l(p));
}

/** "On", "Some", or "Off", as the website's More row. */
export function notificationSummary(prefs: Prefs | null): string | undefined {
  if (!prefs) return undefined;
  if (NOTIFICATION_KINDS.every((k) => notificationOn(prefs, k.key))) return "On";
  return NOTIFICATION_KINDS.some((k) => notificationOn(prefs, k.key)) ? "Some" : "Off";
}

/** The person's choices (null until loaded, or offline), and turning one kind on or off. */
export function useNotificationPrefs() {
  const [prefs, setPrefs] = useState<Prefs | null>(remembered);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listeners.add(setPrefs);
    void getJson<{ prefs: Prefs }>("/api/push/preferences").then((r) => {
      if (!r) return;
      remember(r.prefs ?? {});
    });
    return () => {
      listeners.delete(setPrefs);
    };
  }, []);
  const set = useCallback(
    async (kind: NotificationKind, on: boolean) => {
      if (!prefs || !API_URL) return;
      const next = Object.fromEntries(
        NOTIFICATION_KINDS.map((k) => [k.key, k.key === kind ? on : notificationOn(prefs, k.key)]),
      );
      const before = prefs;
      remember(next);
      setError(null);
      try {
        const token = await getServices().sync.accessToken();
        const res = await fetch(`${API_URL}/api/push/preferences`, {
          method: "PUT",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ prefs: next }),
        });
        if (!res.ok) throw new Error(`The server said ${res.status}.`);
      } catch {
        remember(before);
        setError("Couldn’t save. Try again when you have signal.");
      }
    },
    [prefs],
  );
  return { prefs, set, error };
}
