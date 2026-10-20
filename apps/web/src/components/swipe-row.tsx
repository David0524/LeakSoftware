"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./ui";
import { lockDirection, rubberBand, SETTLE } from "./use-swipe";

/**
 * Swipe actions on a list row, as iOS lists have them (gestures.md section 5): drag the row
 * right for its leading action, left for its trailing ones; it opens to show them and stays open
 * until tapped or dragged back. Touch only, and never a full swipe: the action is a tap on its
 * button. The same actions are always on the row or its page too, so the swipe is a shortcut.
 */
export function SwipeRow({
  leading,
  trailing,
  children,
}: {
  /** Buttons behind the row's left edge (one, e.g. Mark Complete). */
  leading?: ReactNode;
  /** Buttons behind its right edge (e.g. Call and Directions). */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  const lead = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLDivElement>(null);
  /** -1 trailing open, 1 leading open, 0 closed. */
  const [open, setOpen] = useState<-1 | 0 | 1>(0);
  const openRef = useRef(open);
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

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    let start: { x: number; y: number; id: number; base: number } | null = null;
    let lock: "x" | "y" | null = null;
    let dragEnd = 0;
    const widths = () => [lead.current?.offsetWidth ?? 0, trail.current?.offsetWidth ?? 0] as const;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || !e.isPrimary) return;
      const [l, t] = widths();
      const base = openRef.current === 1 ? l : openRef.current === -1 ? -t : 0;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, base };
      lock = null;
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
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
      const max = leading ? l : 0;
      const min = trailing ? -t : 0;
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
      const next = leading && x > l / 2 ? 1 : trailing && x < -t / 2 ? -1 : 0;
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
  }, [leading, trailing]);

  return (
    <div className="relative overflow-hidden rounded-[inherit]" data-no-swipe>
      {leading ? (
        <div
          ref={lead}
          aria-hidden={open !== 1}
          inert={open !== 1}
          className={cx("absolute inset-y-0 left-0 flex", open !== 1 && "pointer-events-none")}
        >
          {leading}
        </div>
      ) : null}
      {trailing ? (
        <div
          ref={trail}
          aria-hidden={open !== -1}
          inert={open !== -1}
          className={cx("absolute inset-y-0 right-0 flex", open !== -1 && "pointer-events-none")}
        >
          {trailing}
        </div>
      ) : null}
      <div ref={row} className="relative touch-pan-y bg-surface">
        {children}
      </div>
    </div>
  );
}

/** A swipe action's button look: a full-height colored block with its label. */
export const SWIPE_ACTION =
  "flex h-full min-w-[4.5rem] flex-col items-center justify-center gap-1 px-3 text-[0.8125rem] font-semibold text-white";
