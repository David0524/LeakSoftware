"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cx, segmentClass } from "./ui";

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
 * Swipe left or right across the content to go to the next or previous page (owner,
 * 2026-10-20: "Add gestures throughout. I want to navigate the different job pages with
 * gestures"), as a paging view does on iPhone. Only a mostly sideways swipe counts, so scrolling
 * stays scrolling; a swipe that starts on something that drags (a drawing, a slider, a map, a
 * sideways scroller, or anything marked `data-no-swipe`) is left to it.
 */
export function SwipePages({
  onPrev,
  onNext,
  className,
  children,
}: {
  onPrev?: () => void;
  onNext?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className={className}
      onTouchStart={(e) => {
        const t = e.touches[0];
        // Touches in a sheet or alert reach here through React's portal bubbling: a swipe in
        // the Add Test sheet must not change the section behind it.
        const inside = e.currentTarget.contains(e.target as Node);
        if (e.touches.length !== 1 || !t || !inside || skips(e.target as Element)) {
          start.current = null;
          return;
        }
        start.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const from = start.current;
        start.current = null;
        const t = e.changedTouches[0];
        if (!from || !t) return;
        const dx = t.clientX - from.x;
        const dy = t.clientY - from.y;
        if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
        if (dx < 0) onNext?.();
        else onPrev?.();
      }}
    >
      {children}
    </div>
  );
}

function skips(el: Element | null): boolean {
  for (let n = el; n; n = n.parentElement) {
    if (n.matches("[data-no-swipe], canvas, svg, input, textarea, select, [role=slider]"))
      return true;
    const style = getComputedStyle(n);
    if (/(auto|scroll)/.test(style.overflowX) && n.scrollWidth > n.clientWidth) return true;
  }
  return false;
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
  return (
    <nav aria-label={label} className={cx(className, "touch-pan-y select-none")} {...handlers}>
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

/** SwipePages to two pages by address (the previous and next day on Schedule). */
export function SwipeHrefs({
  prev,
  next,
  children,
}: {
  prev: string;
  next: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <SwipePages onPrev={() => router.push(prev)} onNext={() => router.push(next)}>
      {children}
    </SwipePages>
  );
}
