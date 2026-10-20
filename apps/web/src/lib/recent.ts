import { parseRecent, rememberRecent, type RecentItem, type SearchOpen } from "@leakbook/core";

// Recent (docs/plans/search-and-activity.md section 1): the last records this person opened,
// kept in this browser only, per person, and cleared when they sign out. Storage can be
// missing or refuse (private windows, blocked site data): then there is simply no Recent.

const PREFIX = "lb_recent:";

/** The screen a search result or Recent entry opens. */
export function openHref(open: SearchOpen): string {
  if (open.screen === "customer") return `/customers/${open.id}`;
  return `/jobs/${open.id}${open.section ? `#${open.section}` : ""}`;
}

export function loadRecent(userId: string): RecentItem[] {
  try {
    return parseRecent(JSON.parse(localStorage.getItem(PREFIX + userId) ?? "[]"));
  } catch {
    return [];
  }
}

export function saveRecent(userId: string, item: RecentItem): RecentItem[] {
  const next = rememberRecent(loadRecent(userId), item);
  try {
    localStorage.setItem(PREFIX + userId, JSON.stringify(next));
  } catch {
    // Not kept; nothing else depends on it.
  }
  return next;
}

export function clearRecent(userId: string) {
  try {
    localStorage.removeItem(PREFIX + userId);
  } catch {
    // Nothing kept to clear.
  }
}

/** Signing out: every person's Recent on this browser goes. */
export function forgetAllRecent() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Nothing kept to clear.
  }
}
