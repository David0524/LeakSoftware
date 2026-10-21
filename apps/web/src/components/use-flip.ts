"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Lists that reorder (a move, Optimize, Plan Week) slide each item from where it was to its
 * new place, so the eye can follow it (owner, 2026-10-20: "find a way for it to remain smooth
 * for the user"; motion.md › brief and precise). Items carry `data-flip="<id>"`; only a change
 * in which items sit where animates, never a layout shift from something else (a map folding),
 * and nothing moves with Reduce Motion. It animates `translate`, not `transform`, so it never
 * fights the drag library's transforms.
 */
export function useFlip(root: RefObject<HTMLElement | null>, paused = false) {
  const last = useRef<{ order: string; rects: Map<string, { x: number; y: number }> } | null>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>("[data-flip]")];
    // Where each item is in its own list: a change here is a reorder.
    const order = items
      .map((i) => `${i.parentElement?.dataset.flipList ?? ""}:${i.dataset.flip}`)
      .join(",");
    const rects = new Map<string, { x: number; y: number }>();
    for (const i of items) {
      const r = i.getBoundingClientRect();
      rects.set(i.dataset.flip!, { x: r.left + window.scrollX, y: r.top + window.scrollY });
    }
    const before = last.current;
    last.current = { order, rects };
    if (!before || before.order === order || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const i of items) {
      const was = before.rects.get(i.dataset.flip!);
      const now = rects.get(i.dataset.flip!)!;
      if (!was) {
        // New to this screen: it fades in where it lands.
        i.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
        continue;
      }
      const dx = was.x - now.x;
      const dy = was.y - now.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      i.animate?.([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], {
        duration: 320,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    }
  });
}
