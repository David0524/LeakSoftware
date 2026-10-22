"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** How often a showing page asks whether its jobs changed. */
export const LIVE_SECONDS = 5;

/** Typing in a field, or a sheet or menu open: a refresh now would get in the way. */
function busyHere(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (
    el &&
    (el.isContentEditable ||
      (el.tagName === "INPUT" &&
        !["button", "checkbox", "radio", "submit"].includes((el as HTMLInputElement).type)) ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT")
  )
    return true;
  return !!document.querySelector("dialog[open], [data-live-hold]");
}

/**
 * Live Today and Schedule (owner, 2026-10-22: "The owner sees techs' progress live; desktop Week
 * updates as stops complete"; docs/design/2026-10-22-owner-live-today.md). While the page is
 * showing it asks every few seconds for a fingerprint of the jobs booked from `from` to `to`
 * (/api/live/jobs, through the database's row security), and fetches the page again in place
 * (router.refresh) when it changes: a tech's Start or Mark Complete on their phone shows within
 * seconds. What's on screen keeps its state (the day shown, an open row).
 *
 * It holds off while a finger or the mouse is down (a drag), something is being typed, or a
 * sheet is open, and catches up on the next check. Coming back to the tab checks at once.
 */
export function LiveRefresh({
  from,
  to,
  seconds = LIVE_SECONDS,
}: {
  from: string;
  to: string;
  seconds?: number;
}) {
  const router = useRouter();
  const seen = useRef<string | null>(null);
  useEffect(() => {
    seen.current = null;
    let pressed = false;
    let asking = false;
    let gone = false;
    const url = `/api/live/jobs?${new URLSearchParams({ from, to })}`;
    const check = async () => {
      if (asking || gone || document.visibilityState !== "visible" || !navigator.onLine) return;
      asking = true;
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;
        const { token } = (await r.json()) as { token?: string };
        if (!token || gone) return;
        if (seen.current !== null && token !== seen.current) {
          // Not now: the next check sees the same change and refreshes then.
          if (pressed || busyHere()) return;
          router.refresh();
        }
        seen.current = token;
      } catch {
        // Offline or the server busy: the next check tries again.
      } finally {
        asking = false;
      }
    };
    const down = () => (pressed = true);
    const up = () => (pressed = false);
    const shown = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    document.addEventListener("visibilitychange", shown);
    window.addEventListener("online", shown);
    void check();
    const timer = setInterval(() => void check(), seconds * 1000);
    return () => {
      gone = true;
      clearInterval(timer);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      document.removeEventListener("visibilitychange", shown);
      window.removeEventListener("online", shown);
    };
  }, [from, to, seconds, router]);
  return null;
}
