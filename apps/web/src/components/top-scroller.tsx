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
    // Each bar follows the other. Only the one being used leads: setting the other's
    // scrollLeft fires its scroll event a frame later, and letting that echo back made a
    // trackpad's glide stutter (owner, 2026-10-24: "spazzy"). The row leads unless the top bar
    // was last touched or scrolled with the wheel.
    let lead: HTMLElement = r;
    const take = (el: HTMLElement) => () => (lead = el);
    const follow = (src: HTMLElement, dst: HTMLElement) => () => {
      if (lead !== src) return;
      if (Math.abs(dst.scrollLeft - src.scrollLeft) >= 1) dst.scrollLeft = src.scrollLeft;
    };
    const onRow = follow(r, t);
    const onTop = follow(t, r);
    const leadRow = take(r);
    const leadTop = take(t);
    r.addEventListener("scroll", onRow, { passive: true });
    t.addEventListener("scroll", onTop, { passive: true });
    for (const kind of ["pointerdown", "wheel", "touchstart", "keydown"] as const) {
      r.addEventListener(kind, leadRow, { passive: true });
      t.addEventListener(kind, leadTop, { passive: true });
    }
    return () => {
      ro.disconnect();
      r.removeEventListener("scroll", onRow);
      t.removeEventListener("scroll", onTop);
      for (const kind of ["pointerdown", "wheel", "touchstart", "keydown"] as const) {
        r.removeEventListener(kind, leadRow);
        t.removeEventListener(kind, leadTop);
      }
    };
  }, []);

  // One box for both bars, so in a grid (the schedule's sidebar layout) the top bar never
  // takes a cell of its own and pushes the row under the sidebar.
  return (
    <div className="min-w-0">
      <div
        ref={top}
        aria-hidden="true"
        data-testid="top-scroller"
        // Menus don't close for its scrolls (row-actions.tsx): it only follows the row.
        data-scroll-mirror=""
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
    </div>
  );
}
