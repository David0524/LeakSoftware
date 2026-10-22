"use client";

import { IDLE_MS, SESSION_GAP_MS, type UsageEventInput } from "@leakbook/core";
import { uuidv7 } from "@leakbook/core";

// Usage on the website (owner, 2026-10-22): which screen is open and for how long, counted
// only while the tab is in front and someone has touched it in the last 5 minutes, plus the
// errors people hit. Sent to /api/usage every minute and when the tab is hidden or closed.
// The office's UsageTracker (components/usage-tracker.tsx) drives it.

const SESSION_KEY = "lb-usage-session";
let queue: UsageEventInput[] = [];
let companyId: string | null = null;

let screen: string | null = null;
let activeMs = 0;
let runningSince: number | null = null;
let lastInput = 0;

function session(now: number): string {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as {
      id: string;
      last: number;
    } | null;
    const id = saved && now - saved.last < SESSION_GAP_MS ? saved.id : uuidv7();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, last: now }));
    return id;
  } catch {
    // Storage blocked: one session per page load.
    return (fallbackSession ??= uuidv7());
  }
}
let fallbackSession: string | null = null;

const inUse = (now: number) => document.visibilityState === "visible" && now - lastInput < IDLE_MS;

/** Stops the clock (tab hidden, idle, or leaving the screen). */
function pause(now: number) {
  if (runningSince === null) return;
  // Idle: count up to the last touch, not the 5 minutes after it.
  const end = now - lastInput >= IDLE_MS ? Math.max(runningSince, lastInput) : now;
  activeMs += Math.max(0, end - runningSince);
  runningSince = null;
}

function resume(now: number) {
  if (runningSince === null && screen && inUse(now)) runningSince = now;
}

/** The screen's time so far, queued, and the clock reset. */
function closeScreen(now: number) {
  pause(now);
  if (screen && activeMs >= 500)
    queue.push({
      kind: "screen",
      screen,
      ms: activeMs,
      at: new Date(now).toISOString(),
      session: session(now),
    });
  activeMs = 0;
}

/** The person moved to another screen (a pathname). */
export function usageScreen(path: string, company: string | null) {
  const now = Date.now();
  companyId = company;
  if (path === screen) return;
  closeScreen(now);
  screen = path;
  lastInput = now;
  resume(now);
}

/** A touch, a key, a scroll: someone's here. */
export function usageInput() {
  const now = Date.now();
  lastInput = now;
  resume(now);
}

/** Checked every few seconds and when the tab is hidden or shown. */
export function usageTick() {
  const now = Date.now();
  if (inUse(now)) resume(now);
  else pause(now);
}

/** An error someone hit on this screen (an error page, a save that failed). */
export function usageError(detail: string) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  queue.push({
    kind: "error",
    screen: location.pathname,
    detail: detail.slice(0, 200),
    at: new Date(now).toISOString(),
    session: session(now),
  });
}

/** Sends what's queued; `leaving`: the page is hidden or closing (a beacon, which survives it). */
export function usageFlush(leaving = false) {
  if (leaving) closeScreen(Date.now());
  if (queue.length === 0) return;
  const body = JSON.stringify({
    platform: "web",
    company_id: companyId,
    events: queue.slice(0, 200),
  });
  queue = queue.slice(200);
  if (leaving && navigator.sendBeacon) {
    navigator.sendBeacon("/api/usage", new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch("/api/usage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}
