"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./ui";
import { lockDirection, rubberBand, SETTLE } from "./use-swipe";

/** A swipe action as data, so a list can give the same action to its swipe and its menu. */
export interface SwipeAction {
  label: string;
  /** The block's color: green (Call, Done), blue (Directions, Move), orange, red (Delete), gray. */
  tone: "green" | "blue" | "orange" | "red" | "gray";
  icon?: ReactNode;
  onSelect?: () => void;
  href?: string;
  /** Opens outside the site (tel:, sms:, Maps). */
  external?: boolean;
}

const TONES: Record<SwipeAction["tone"], string> = {
  green: "bg-status-pass",
  blue: "bg-link",
  orange: "bg-status-warning",
  red: "bg-status-fail",
  gray: "bg-text-muted",
};

/** A side's actions as the colored blocks behind the row, in the order given (left to right). */
export function SwipeButtons({ actions }: { actions: SwipeAction[] }) {
  return (
    <>
      {actions.map((a) => {
        const className = cx(SWIPE_ACTION, TONES[a.tone]);
        const body = (
          <>
            {a.icon}
            {a.label}
          </>
        );
        if (a.href && a.external)
          return (
            <a
              key={a.label}
              href={a.href}
              className={className}
              {...(/^https?:/.test(a.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              onClick={a.onSelect}
            >
              {body}
            </a>
          );
        if (a.href)
          return (
            <Link key={a.label} href={a.href} className={className} onClick={a.onSelect}>
              {body}
            </Link>
          );
        return (
          <button key={a.label} type="button" className={className} onClick={a.onSelect}>
            {body}
          </button>
        );
      })}
    </>
  );
}

/** Touches here are their own: a drag grip, a player's controls, a field. */
const OWN_GESTURE =
  "[data-grip], [data-no-row-swipe], video, audio, input, textarea, select, [role=slider], [role=radio][aria-checked=true]";

/**
 * Swipe actions on a list row, as iOS lists have them (gestures.md section 5): drag the row
 * right for its leading action, left for its trailing ones; it opens to show them and stays open
 * until tapped or dragged back. Touch only, and never a full swipe: the action is a tap on its
 * button. The same actions are always on the row or its page too, so the swipe is a shortcut.
 */
export function SwipeRow({
  leading,
  trailing,
  paused = false,
  className,
  children,
}: {
  /** Buttons behind the row's left edge (one, e.g. Mark Complete). */
  leading?: ReactNode;
  /** Buttons behind its right edge (e.g. Call and Directions). */
  trailing?: ReactNode;
  /** No new swipes (the row's menu is open, or it's saving). */
  paused?: boolean;
  /** The row's own look (a card's corners), on the part that moves. */
  className?: string;
  children: ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  const lead = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLDivElement>(null);
  /** -1 trailing open, 1 leading open, 0 closed. */
  const [open, setOpen] = useState<-1 | 0 | 1>(0);
  const openRef = useRef(open);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  // Paused (its menu opened): an open row closes.
  const [wasPaused, setWasPaused] = useState(paused);
  if (paused !== wasPaused) {
    setWasPaused(paused);
    if (paused) setOpen(0);
  }
  useEffect(() => {
    openRef.current = open;
    const el = row.current;
    if (!el) return;
    const x =
      open === 1
        ? (lead.current?.offsetWidth ?? 0)
        : open === -1
          ? -(trail.current?.offsetWidth ?? 0)
          : 0;
    el.style.transition = `transform ${SETTLE}`;
    el.style.transform = x ? `translate3d(${x}px,0,0)` : "";
  }, [open]);

  // The actions behind the row are drawn from its first touch, so a mouse-only page (and its
  // text) never has them.
  const [armed, setArmed] = useState(false);
  const hasLead = !!leading;
  const hasTrail = !!trailing;
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    let start: { x: number; y: number; id: number; base: number } | null = null;
    let lock: "x" | "y" | null = null;
    let dragEnd = 0;
    const widths = () => [lead.current?.offsetWidth ?? 0, trail.current?.offsetWidth ?? 0] as const;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || !e.isPrimary || pausedRef.current) return;
      // No actions on either side right now: the row stays put.
      if (!hasLead && !hasTrail) return;
      if ((e.target as Element).closest?.(OWN_GESTURE)) return;
      setArmed(true);
      const [l, t] = widths();
      const base = openRef.current === 1 ? l : openRef.current === -1 ? -t : 0;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, base };
      lock = null;
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      if (pausedRef.current) {
        start = null;
        return;
      }
      const dx = e.clientX - start.x;
      if (!lock) {
        lock = lockDirection(dx, e.clientY - start.y);
        if (lock === "y") {
          start = null;
          return;
        }
        if (!lock) return;
        el.setPointerCapture?.(e.pointerId);
        el.style.transition = "none";
      }
      const [l, t] = widths();
      let x = start.base + dx;
      // Past the buttons (or with none on that side) it gives like a rubber band.
      const max = hasLead ? l : 0;
      const min = hasTrail ? -t : 0;
      if (x > max) x = max + rubberBand(x - max, el.offsetWidth);
      if (x < min) x = min + rubberBand(x - min, el.offsetWidth);
      el.style.transform = `translate3d(${x}px,0,0)`;
    };
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const x = start.base + (e.clientX - start.x);
      start = null;
      if (lock !== "x") return;
      dragEnd = Date.now();
      const [l, t] = widths();
      const next = hasLead && x > l / 2 ? 1 : hasTrail && x < -t / 2 ? -1 : 0;
      // Same state: the effect won't run, so settle here.
      if (next === openRef.current) {
        el.style.transition = `transform ${SETTLE}`;
        el.style.transform =
          next === 1 ? `translate3d(${l}px,0,0)` : next === -1 ? `translate3d(${-t}px,0,0)` : "";
      }
      setOpen(next);
    };
    const cancel = () => {
      if (!start) return;
      start = null;
      if (lock === "x") setOpen(0);
    };
    // A swipe isn't a tap; a tap on an open row closes it.
    const click = (e: MouseEvent) => {
      if (Date.now() - dragEnd < 400 || openRef.current) {
        e.preventDefault();
        e.stopPropagation();
        if (Date.now() - dragEnd >= 400) setOpen(0);
      }
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("click", click, true);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("click", click, true);
    };
  }, [hasLead, hasTrail]);

  return (
    <div
      className="relative overflow-hidden rounded-[inherit]"
      data-no-swipe={hasLead || hasTrail ? "" : undefined}
    >
      {/* A tap on an action closes the row as it acts. */}
      {leading && armed ? (
        <div
          ref={lead}
          onClick={() => setOpen(0)}
          aria-hidden={open !== 1}
          inert={open !== 1}
          className={cx("absolute inset-y-0 left-0 flex", open !== 1 && "pointer-events-none")}
        >
          {leading}
        </div>
      ) : null}
      {trailing && armed ? (
        <div
          ref={trail}
          onClick={() => setOpen(0)}
          aria-hidden={open !== -1}
          inert={open !== -1}
          className={cx("absolute inset-y-0 right-0 flex", open !== -1 && "pointer-events-none")}
        >
          {trailing}
        </div>
      ) : null}
      <div ref={row} className={cx("relative touch-pan-y bg-surface", className)}>
        {children}
      </div>
    </div>
  );
}

/** A swipe action's button look: a full-height colored block with its label. */
export const SWIPE_ACTION =
  "flex h-full min-w-[4.5rem] flex-col items-center justify-center gap-1 px-3 text-[0.8125rem] font-semibold text-white";
