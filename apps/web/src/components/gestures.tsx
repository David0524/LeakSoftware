"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cx, segmentClass } from "./ui";
import { useSwipe } from "./use-swipe";

/**
 * Hold the chosen segment and drag it along the track, as iOS 26's segmented controls do
 * (owner, 2026-10-19: "hold the slider/selector like a bubble and drag it around"). Give the
 * track the returned handlers and mark each segment `data-segment`. `pick` runs as the finger
 * crosses segments (live), or only on release with `onRelease`, for segments that navigate.
 */
export function useSegmentDrag(
  active: number,
  pick: (index: number) => void,
  { onRelease = false }: { onRelease?: boolean } = {},
) {
  const [held, setHeld] = useState<number | null>(null);
  const dragging = useRef(false);
  function indexAt(e: PointerEvent<HTMLElement>) {
    const segments = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-segment]")];
    return segments.findIndex((b) => {
      const r = b.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right;
    });
  }
  return {
    /** The segment under the finger while held (draw the thumb there), else null. */
    held,
    handlers: {
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (indexAt(e) !== active) return;
        dragging.current = true;
        setHeld(active);
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        if (!dragging.current) return;
        const i = indexAt(e);
        if (i < 0 || i === held) return;
        setHeld(i);
        if (!onRelease) pick(i);
      },
      onPointerUp() {
        if (dragging.current && onRelease && held !== null && held !== active) pick(held);
        dragging.current = false;
        setHeld(null);
      },
      onPointerCancel() {
        dragging.current = false;
        setHeld(null);
      },
    },
  };
}

/**
 * Large text (owner, 2026-10-20): a segmented control whose labels no longer fit on one row
 * scrolls sideways inside its own track, as iOS apps do at accessibility text sizes (iOS never
 * wraps a segmented control onto two rows, and the page itself never scrolls sideways). Give
 * the track the returned ref and the `segment-scroll` class; the track gets `data-overflow`
 * only while it overflows, so at normal sizes nothing changes (no clipped thumb shadow).
 * `selected` keeps the chosen segment in view.
 */
export function useTrackOverflow<T extends HTMLElement>(selected?: number) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => el.toggleAttribute("data-overflow", el.scrollWidth > el.clientWidth + 1);
    const watch = new ResizeObserver(check);
    watch.observe(el);
    for (const child of el.children) watch.observe(child);
    check();
    return () => watch.disconnect();
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || selected == null || !el.hasAttribute("data-overflow")) return;
    const segment = el.querySelectorAll<HTMLElement>("[data-segment]")[selected];
    if (!segment) return;
    const left = segment.offsetLeft - el.offsetLeft;
    if (left < el.scrollLeft) el.scrollLeft = left - 8;
    else if (left + segment.offsetWidth > el.scrollLeft + el.clientWidth)
      el.scrollLeft = left + segment.offsetWidth - el.clientWidth + 8;
  }, [selected]);
  return ref;
}

/**
 * Swipe left or right across the content to go to the next or previous page (owner,
 * 2026-10-20: "Add gestures throughout. I want to navigate the different job pages with
 * gestures"), as a paging view does on iPhone: the page follows the finger and settles with a
 * spring (use-swipe.ts). Only a sideways drag counts, so scrolling stays scrolling; a swipe that
 * starts on something that drags (a drawing, a slider, a map, a sideways scroller, or anything
 * marked `data-no-swipe`) is left to it. Touch only: a mouse selects text as usual.
 */
export function SwipePages({
  page,
  canPrev = true,
  canNext = true,
  onPrev,
  onNext,
  enabled = true,
  navigate,
  scrollFirst = false,
  className,
  children,
}: {
  /** Names the page shown; when it changes after a swipe, the new page slides in. */
  page: string | number;
  canPrev?: boolean;
  canNext?: boolean;
  onPrev: () => void;
  onNext: () => void;
  enabled?: boolean;
  /** Turning a page loads another address (see useSwipe). */
  navigate?: { scope: string };
  /**
   * Leave the browser every pan, as Today's card does (owner, 2026-10-21: "I can't scroll on
   * a Scheduling tile"): a drag that starts a little sideways still scrolls the page, and
   * useSwipe stops the browser's scroll only once a drag is clearly sideways.
   */
  scrollFirst?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { area, content } = useSwipe({
    page,
    canPrev,
    canNext,
    onPrev,
    onNext,
    enabled,
    navigate,
  });
  return (
    <div
      ref={area}
      className={cx(
        scrollFirst ? "touch-manipulation" : "touch-pan-y",
        "overflow-x-clip",
        className,
      )}
    >
      <div ref={content} className="will-change-auto">
        {children}
      </div>
    </div>
  );
}

/** Links shown as a segmented control (Day | Week | Month), whose thumb can be dragged too. */
export function SegmentedLinks({
  label,
  items,
  className,
}: {
  label: string;
  items: { href: string; label: string; active: boolean }[];
  className: string;
}) {
  const router = useRouter();
  const active = items.findIndex((i) => i.active);
  const { held, handlers } = useSegmentDrag(active, (i) => router.push(items[i]!.href), {
    onRelease: true,
  });
  const shown = held ?? active;
  const track = useTrackOverflow<HTMLElement>(active);
  return (
    <nav
      ref={track}
      aria-label={label}
      className={cx(className, "segment-scroll touch-pan-y select-none")}
      {...handlers}
    >
      {items.map((item, i) => (
        <a
          key={item.href}
          href={item.href}
          data-segment
          aria-current={item.active ? "page" : undefined}
          onClick={(e) => {
            e.preventDefault();
            router.push(item.href);
          }}
          className={cx(
            segmentClass(
              i === shown,
              cx(
                "px-3 text-[0.9375rem] transition-transform duration-200 motion-reduce:transition-none",
                held === i && "scale-[1.06] shadow-lg",
              ),
            ),
          )}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

/**
 * SwipePages to two pages by address (the day before and after on Schedule). Both are fetched
 * ahead, so the swipe lands without waiting; the old page slides away and the new one slides in.
 */
export function SwipeHrefs({
  page,
  prev,
  next,
  scope,
  children,
}: {
  /** The page shown (its address), so the new one slides in when it arrives. */
  page: string;
  prev: string;
  next: string;
  /** Names this pager: the page remounts when its address changes. */
  scope: string;
  children: ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    router.prefetch(prev);
    router.prefetch(next);
  }, [router, prev, next]);
  return (
    <SwipePages
      page={page}
      navigate={{ scope }}
      scrollFirst
      onPrev={() => router.push(prev, { scroll: false })}
      onNext={() => router.push(next, { scroll: false })}
    >
      {children}
    </SwipePages>
  );
}
