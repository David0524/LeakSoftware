"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cx } from "./ui";

/** The lists that refresh when pulled down (gestures.md section 5). */
const LISTS = ["/today", "/schedule", "/jobs", "/customers", "/messages", "/invoices"];
/** How far to pull (after the drag's resistance) before letting go refreshes. */
const PULL_PX = 64;

/**
 * Pull to refresh on the phone website's lists, as iOS lists do (gestures.md section 5): pull
 * down at the top of the page and let go to fetch the page again in place (router.refresh), with
 * no blank screen. Only when the site runs from the Home Screen: a browser tab has its own pull
 * to refresh (Safari, Chrome), and two would fight.
 */
export function PullToRefresh() {
  const path = usePathname();
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [busy, start] = useTransition();
  useEffect(() => {
    if (!LISTS.includes(path)) return;
    const standalone =
      matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;
    let from: number | null = null;
    let shown = 0;
    const down = (e: TouchEvent) => {
      // At the top, one finger, and no sheet up (a sheet holds the page still).
      if (window.scrollY > 0 || e.touches.length !== 1 || document.body.style.overflow === "hidden")
        return;
      from = e.touches[0]!.clientY;
    };
    const move = (e: TouchEvent) => {
      if (from == null) return;
      const d = e.touches[0]!.clientY - from;
      if (d <= 0 || window.scrollY > 0) {
        from = null;
        shown = 0;
        setPull(0);
        return;
      }
      shown = Math.min(d * 0.5, PULL_PX * 1.4);
      setPull(shown);
    };
    const up = () => {
      if (from == null) return;
      from = null;
      if (shown >= PULL_PX) start(() => router.refresh());
      shown = 0;
      setPull(0);
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
    };
  }, [path, router]);

  if (!pull && !busy) return null;
  const ready = pull >= PULL_PX || busy;
  return (
    <div
      aria-hidden={!busy}
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3rem)] z-40 flex justify-center sm:hidden"
      style={{ transform: `translateY(${busy ? PULL_PX / 2 : pull / 2}px)` }}
    >
      <span
        role={busy ? "status" : undefined}
        className="glass glass-strong grid size-9 place-items-center rounded-full"
      >
        <svg
          viewBox="0 0 24 24"
          className={cx("size-5 text-text-muted", busy && "motion-safe:animate-spin")}
          style={busy ? undefined : { transform: `rotate(${(pull / PULL_PX) * 270}deg)` }}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        >
          <path d="M12 3a9 9 0 1 0 9 9" opacity={ready ? 1 : 0.5} />
        </svg>
        {busy ? <span className="sr-only">Refreshing</span> : null}
      </span>
    </div>
  );
}
