"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A second horizontal scrollbar above a row that slides sideways, kept in step with the row's
 * own (owner, 2026-10-21: "horizontal scroller needs to be on top too"), so the row can be
 * moved without scrolling down to its end. Shown from tablet width up, and only when the row
 * is wider than its space.
 */
export function TopScroller({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { "data-testid"?: string }) {
  const top = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const r = row.current;
    const t = top.current;
    if (!r || !t) return;
    const measure = () => {
      setWidth(r.scrollWidth);
      setOverflows(r.scrollWidth > r.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(r);
    for (const child of Array.from(r.children)) ro.observe(child);
    // Each bar follows the other; the guard stops them echoing.
    let from: HTMLElement | null = null;
    const follow = (src: HTMLElement, dst: HTMLElement) => () => {
      if (from && from !== src) return;
      from = src;
      dst.scrollLeft = src.scrollLeft;
      requestAnimationFrame(() => (from = null));
    };
    const onRow = follow(r, t);
    const onTop = follow(t, r);
    r.addEventListener("scroll", onRow, { passive: true });
    t.addEventListener("scroll", onTop, { passive: true });
    return () => {
      ro.disconnect();
      r.removeEventListener("scroll", onRow);
      t.removeEventListener("scroll", onTop);
    };
  }, []);

  return (
    <>
      <div
        ref={top}
        aria-hidden="true"
        data-testid="top-scroller"
        className={
          overflows
            ? "mb-2 hidden overflow-x-auto overflow-y-hidden [scrollbar-width:thin] md:block"
            : "hidden"
        }
      >
        <div style={{ width, height: 1 }} />
      </div>
      <div ref={row} className={className} {...rest}>
        {children}
      </div>
    </>
  );
}
