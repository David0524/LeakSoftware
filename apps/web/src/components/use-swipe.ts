"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/*
 * Swipe between pages on touch screens (owner, 2026-10-20; docs/design/2026-10-20-gestures.md
 * sections 1 and 4), as a paging view does on iPhone: the page follows the finger, settles with
 * a spring, and gives like a rubber band past the first or last page. A drag decides its
 * direction after 10 px: up or down is the page's own scrolling (the area sets
 * `touch-action: pan-y`, so the browser keeps it), sideways is ours. A swipe never starts on
 * something that drags or scrolls sideways (a map, a drawing, a slider, a signature pad, a
 * sideways scroller, or anything marked `data-no-swipe`). With Reduce Motion the page doesn't
 * follow the finger, and the new page cross-fades in.
 */

/** How far a finger moves before the drag is sideways or up-and-down. */
export const SWIPE_LOCK_PX = 10;
/** The settle: a spring-like ease-out of 0.35 s (motion.md: quick, and interruptible). */
export const SETTLE = "0.35s cubic-bezier(0.22, 1, 0.36, 1)";

/** Which way a drag goes once it has moved far enough to tell; null until then. */
export function lockDirection(dx: number, dy: number, at = SWIPE_LOCK_PX): "x" | "y" | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < at) return null;
  return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

/** Past the first or last page the content gives less and less, as iOS's rubber band does. */
export function rubberBand(dx: number, width: number, c = 0.55): number {
  if (width <= 0) return 0;
  const d = Math.abs(dx);
  return Math.sign(dx) * (1 - 1 / ((d * c) / width + 1)) * width;
}

/**
 * Where a released drag goes: 1 (the next page, a swipe to the left), -1 (the previous one) or 0
 * (back where it was). It turns past a quarter of the width, or on a quick flick the same way.
 * `velocity` is in px per ms, negative to the left.
 */
export function swipeOutcome(input: {
  dx: number;
  velocity: number;
  width: number;
  canPrev: boolean;
  canNext: boolean;
}): -1 | 0 | 1 {
  const { dx, velocity, width, canPrev, canNext } = input;
  const far = Math.abs(dx) > width * 0.25;
  const flick =
    Math.abs(velocity) > 0.35 && Math.abs(dx) > 24 && Math.sign(velocity) === Math.sign(dx);
  if (!far && !flick) return 0;
  if (dx < 0) return canNext ? 1 : 0;
  return canPrev ? -1 : 0;
}

/** Whether a touch on this element is left to it (it drags or scrolls sideways itself). */
export function startsOnOwnGesture(el: Element | null, area: Element | null): boolean {
  for (let n = el; n && n !== area; n = n.parentElement) {
    if (
      n.matches(
        "[data-no-swipe], canvas, input, textarea, select, [role=slider], [draggable=true], .mapboxgl-map, [data-map]",
      )
    )
      return true;
    // A drawing (the pool diagram), not an icon.
    if (n instanceof SVGSVGElement && n.getBoundingClientRect().width > 64) return true;
    const style = getComputedStyle(n);
    if (/(auto|scroll)/.test(style.overflowX) && n.scrollWidth > n.clientWidth) return true;
  }
  return false;
}

const reduced = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Moves the page (no transition by default). */
function place(el: HTMLElement | null, x: number, opacity = 1, transition = "none") {
  if (!el) return;
  el.style.transition = transition;
  el.style.transform = x ? `translate3d(${x}px,0,0)` : "";
  el.style.opacity = opacity === 1 ? "" : String(opacity);
}

/** Draws the page at x, then lets it settle home (a cross-fade with Reduce Motion). */
function settleFrom(el: HTMLElement | null, x: number, opacity: number) {
  if (!el) return;
  place(el, x, opacity);
  // Read layout so the start position is drawn before the transition.
  void el.offsetWidth;
  if (reduced()) place(el, 0, 1, "opacity 0.2s ease-out");
  else place(el, 0, 1, `transform ${SETTLE}, opacity ${SETTLE}`);
}

/** A page swiped to by address: the next page slides in when it arrives (it remounts). */
const entering = new Map<string, { dir: 1 | -1; at: number }>();

/**
 * Give `area` the touches and `content` the movement. `page` names the page shown: when it
 * changes after a swipe, the new page slides in from the side the finger came from. With
 * `navigate`, turning a page loads another address: the old page slides away, and the new one
 * slides in once it arrives (`scope` names the pager, since the page remounts).
 */
export function useSwipe<
  A extends HTMLElement = HTMLDivElement,
  C extends HTMLElement = HTMLDivElement,
>({
  canPrev,
  canNext,
  onPrev,
  onNext,
  page,
  enabled = true,
  navigate,
}: {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  page: string | number;
  enabled?: boolean;
  navigate?: { scope: string };
}) {
  const area = useRef<A>(null);
  const content = useRef<C>(null);
  // The latest options, read by the listeners (attached once).
  const opts = useRef({ canPrev, canNext, onPrev, onNext, enabled, navigate });
  useLayoutEffect(() => {
    opts.current = { canPrev, canNext, onPrev, onNext, enabled, navigate };
  });
  /** A turn waiting for its page: where the new page starts. */
  const pending = useRef<{
    from: number;
    dir: 1 | -1;
    timer?: ReturnType<typeof setTimeout>;
  } | null>(null);

  const set = (x: number, opacity = 1, transition = "none") =>
    place(content.current, x, opacity, transition);

  // The new page is in: it slides (or fades) in from where the old one left.
  useLayoutEffect(() => {
    const p = pending.current;
    const scope = opts.current.navigate?.scope;
    const from = scope ? entering.get(scope) : null;
    if (p) {
      clearTimeout(p.timer);
      pending.current = null;
      if (scope) entering.delete(scope);
      if (reduced()) settleFrom(content.current, 0, 0);
      else settleFrom(content.current, p.from, opts.current.navigate ? 0 : 1);
    } else if (scope && from && Date.now() - from.at < 5000) {
      entering.delete(scope);
      const w = content.current?.offsetWidth ?? 0;
      if (reduced()) settleFrom(content.current, 0, 0);
      else settleFrom(content.current, from.dir * w * 0.35, 0);
    }
  }, [page]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    let start: { x: number; y: number; id: number } | null = null;
    let lock: "x" | "y" | null = null;
    let samples: { x: number; t: number }[] = [];
    let width = 0;
    let dragEnd = 0;

    const down = (e: PointerEvent) => {
      const o = opts.current;
      if (!o.enabled || e.pointerType === "mouse" || !e.isPrimary || pending.current) return;
      if (startsOnOwnGesture(e.target as Element, el)) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      lock = null;
      samples = [{ x: e.clientX, t: e.timeStamp }];
      width = el.getBoundingClientRect().width;
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!lock) {
        lock = lockDirection(dx, dy);
        if (lock === "y") {
          start = null;
          return;
        }
        if (!lock) return;
        el.setPointerCapture?.(e.pointerId);
      }
      samples.push({ x: e.clientX, t: e.timeStamp });
      if (samples.length > 5) samples.shift();
      if (reduced()) return;
      const o = opts.current;
      const open = dx < 0 ? o.canNext : o.canPrev;
      set(open ? dx : rubberBand(dx, width));
    };
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      start = null;
      if (lock !== "x") return;
      dragEnd = Date.now();
      const first = samples[0]!;
      const last = samples[samples.length - 1]!;
      const velocity = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
      const o = opts.current;
      const turn = swipeOutcome({ dx, velocity, width, canPrev: o.canPrev, canNext: o.canNext });
      if (!turn) {
        if (reduced()) set(0);
        else set(0, 1, `transform ${SETTLE}`);
        return;
      }
      const dir = turn;
      if (o.navigate) {
        // The old page slides away while the next one loads.
        entering.set(o.navigate.scope, { dir, at: Date.now() });
        if (!reduced()) set(-dir * width * 0.35, 0, "transform 0.2s ease-in, opacity 0.2s ease-in");
        else set(0, 0, "opacity 0.15s ease-in");
      }
      pending.current = {
        // Where the next page would have been, beside this one (or a short way, by address).
        from: o.navigate ? dir * width * 0.35 : dx + dir * width,
        dir,
        // The page didn't change (or is slow to): put this one back.
        timer: setTimeout(
          () => {
            pending.current = null;
            if (o.navigate) entering.delete(o.navigate.scope);
            set(0, 1, `transform ${SETTLE}, opacity ${SETTLE}`);
          },
          o.navigate ? 4000 : 300,
        ),
      };
      if (dir === 1) o.onNext();
      else o.onPrev();
    };
    const cancel = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      if (lock === "x") set(0, 1, `transform ${SETTLE}`);
    };
    // A swipe isn't a tap: the link or button under the finger doesn't open.
    const click = (e: MouseEvent) => {
      if (Date.now() - dragEnd < 400) {
        e.preventDefault();
        e.stopPropagation();
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
  }, []);

  /**
   * The page is about to change without a swipe (Mark Complete moves Today's card on): the next
   * page slides in from that side when it arrives, the same slide as swiping.
   */
  const arm = (dir: 1 | -1) => {
    const width = content.current?.offsetWidth ?? 0;
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = {
      from: dir * width,
      dir,
      timer: setTimeout(() => {
        pending.current = null;
      }, 8000),
    };
  };

  return { area, content, arm };
}
