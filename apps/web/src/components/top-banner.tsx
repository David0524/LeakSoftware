"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { usePathname } from "next/navigation";
import { CheckIcon, WarningIcon } from "./icons";
import { cx } from "./ui";

/*
 * A result banner at the top of the screen (owner, 2026-10-20: the planner's note "looks
 * horrible. Display it on a banner on the top of the screen"): a floating glass capsule under
 * the navigation bar with a symbol and one short line, as iOS shows a passing confirmation.
 * It slides down, goes away by itself after a few seconds (not while the pointer or focus is
 * on it), and a tap or a swipe up puts it away. Errors stay until they're put away. One at a
 * time: a new result replaces the last. Not a snackbar: no bar along the bottom, no shadowed
 * slab, and the page stays as it was under it.
 */

export interface BannerInput {
  tone?: "success" | "warning" | "error";
  /** One short line: "Optimized · 1 hr 6 min less driving · Back by 4:28 PM". */
  message: string;
  /** A second, smaller line: what to watch for. */
  detail?: string;
  /** One button at the end, such as Undo. */
  action?: { label: string; onAction: () => void };
}

interface Banner extends BannerInput {
  id: number;
}

const SHOW_MS = 4_000;
/** Long enough to reach Undo. */
const ACTION_MS = 8_000;
/** The exit's length (globals.css › banner-out). */
const OUT_MS = 220;

/** The banner on screen; `leaving` while it slides away. */
let current: { banner: Banner; leaving: boolean } | null = null;
let nextId = 1;
let leave: ReturnType<typeof setTimeout> | undefined;
const subscribers = new Set<() => void>();
const emit = () => subscribers.forEach((f) => f());

/** Show a result at the top of the screen; returns its id (for `dismissBanner`). */
export function showBanner(b: BannerInput): number {
  clearTimeout(leave);
  current = { banner: { ...b, id: nextId++ }, leaving: false };
  emit();
  return current.banner.id;
}

/** Put the banner away (only that one, given its id). */
export function dismissBanner(id?: number) {
  if (!current || current.leaving || (id != null && current.banner.id !== id)) return;
  const was = current.banner.id;
  current = { ...current, leaving: true };
  emit();
  leave = setTimeout(() => {
    if (current?.banner.id !== was) return;
    current = null;
    emit();
  }, OUT_MS);
}

const subscribe = (f: () => void) => {
  subscribers.add(f);
  return () => void subscribers.delete(f);
};

/**
 * Where banners appear: once, in the app's frame. Two live regions stay mounted so screen
 * readers hear each result (status for results, alert for errors).
 */
export function BannerHost() {
  const shown = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  // Going to another screen puts the banner away: it was about the last one.
  const path = usePathname();
  useEffect(() => dismissBanner(), [path]);

  const error = shown?.banner.tone === "error";
  const view = shown ? (
    <BannerView key={shown.banner.id} banner={shown.banner} leaving={shown.leaving} />
  ) : null;
  return (
    <div
      // Under the phone navigation bar (44 pt below the status bar), or under the wider
      // screens' 56 pt header; centered, never wider than a phone.
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3.25rem)] z-40 flex justify-center px-4 sm:top-[4.25rem]"
    >
      <div role="status" aria-live="polite" className="flex w-full justify-center empty:hidden">
        {error ? null : view}
      </div>
      <div role="alert" className="flex w-full justify-center empty:hidden">
        {error ? view : null}
      </div>
    </div>
  );
}

function BannerView({ banner: b, leaving }: { banner: Banner; leaving: boolean }) {
  const tone = b.tone ?? "success";
  const [held, setHeld] = useState(false);
  const [dy, setDy] = useState(0);
  const start = useRef<{ y: number; moved: boolean } | null>(null);
  const timed = tone !== "error";
  const ms = b.action ? ACTION_MS : SHOW_MS;

  useEffect(() => {
    if (!timed || held || leaving) return;
    const t = setTimeout(() => dismissBanner(b.id), ms);
    return () => clearTimeout(t);
  }, [timed, held, leaving, ms, b.id]);

  // A swipe up puts it away; a tap (no swipe) does too, except on its button.
  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as Element).closest("button")) return;
    start.current = { y: e.clientY, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const d = e.clientY - s.y;
    if (Math.abs(d) > 4) s.moved = true;
    // Up follows the finger; down only gives a little.
    setDy(d < 0 ? d : Math.min(d / 4, 8));
  };
  const onPointerUp = () => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (!s.moved || dy < -16) dismissBanner(b.id);
    setDy(0);
  };

  return (
    <div
      data-testid="top-banner"
      data-tone={tone}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        start.current = null;
        setDy(0);
      }}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      style={dy ? { translate: `0 ${dy}px` } : undefined}
      className={cx(
        "glass glass-strong pointer-events-auto flex w-full max-w-[26rem] touch-none items-center gap-3 py-2 pr-2 pl-2.5 select-none",
        b.detail ? "rounded-[1.375rem]" : "rounded-full",
        leaving ? "banner-out" : "banner-in",
        !dy && "transition-[translate] duration-200",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "grid size-8 shrink-0 place-items-center rounded-full text-white",
          tone === "success"
            ? "bg-status-pass"
            : tone === "warning"
              ? "bg-status-warning"
              : "bg-status-fail",
        )}
      >
        {tone === "success" ? (
          <CheckIcon className="size-[1.125rem] [stroke-width:2.6]" />
        ) : (
          <WarningIcon className="size-[1.125rem] [stroke-width:2.2]" />
        )}
      </span>
      <span className={cx("min-w-0 flex-1 py-1", !b.action && "pr-2")}>
        <span className="block text-[0.9375rem] leading-snug font-semibold">{b.message}</span>
        {b.detail ? (
          <span className="mt-0.5 block text-[0.8125rem] leading-snug text-text-muted">
            {b.detail}
          </span>
        ) : null}
      </span>
      {b.action ? (
        <button
          type="button"
          onClick={() => {
            dismissBanner(b.id);
            b.action!.onAction();
          }}
          className="min-h-11 shrink-0 rounded-full px-4 font-semibold text-link hover:bg-link/10 active:bg-link/15"
        >
          {b.action.label}
        </button>
      ) : null}
      {/* Keyboards and screen readers: a way to put it away besides waiting. */}
      <button
        type="button"
        onClick={() => dismissBanner(b.id)}
        className="sr-only focus:not-sr-only focus:min-h-11 focus:rounded-full focus:px-3 focus:text-link"
      >
        Close
      </button>
    </div>
  );
}
