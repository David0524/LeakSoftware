"use client";

import { moveInList } from "@leakbook/core";

/*
 * Rows that slide to their new place at once when a list is reordered (owner, 2026-10-21:
 * "That reordering animation is so smooth. Let's make reordering jobs just as smooth"): a move
 * shifts the rows to where the new order puts them before the server answers, the rows in the
 * way slide aside while one is dragged, and when the page comes back in its new order every row
 * that moved slides from where it was seen (FLIP). Only transforms change, never the DOM, so
 * React keeps the list it rendered. With Reduce Motion rows jump instead of sliding.
 */

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const SLIDE_MS = 300;

export const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const shifts = new WeakMap<HTMLElement, number>();

/** Moves a row `dy` px from its place in the layout, sliding unless `animate` is false. */
export function shift(el: HTMLElement, dy: number, animate = true) {
  shifts.set(el, dy);
  el.style.transition = animate && !reducedMotion() ? `transform ${SLIDE_MS}ms ${EASE}` : "none";
  el.style.transform = dy ? `translateY(${dy}px)` : "";
}

const shiftOf = (el: HTMLElement) => shifts.get(el) ?? 0;

/** A row's top on the page where the layout puts it (its shift left out). */
export const layoutTop = (el: HTMLElement) =>
  el.getBoundingClientRect().top + window.scrollY - shiftOf(el);

/** Where each row is shown (or sliding to), by key, in page coordinates. */
export function shownTops(rows: HTMLElement[], key: (el: HTMLElement) => string) {
  return new Map(rows.map((el) => [key(el), layoutTop(el) + shiftOf(el)]));
}

/** Slides `rows` (in their DOM order) to where moving the one at `from` to `to` puts them. */
export function slideTo(rows: HTMLElement[], from: number, to: number) {
  if (from < 0 || !rows.length) return;
  const tops = rows.map(layoutTop);
  const heights = rows.map((r) => r.offsetHeight);
  const gap = rows.length > 1 ? Math.max(0, tops[1]! - tops[0]! - heights[0]!) : 0;
  let y = tops[0]!;
  for (const i of moveInList(
    rows.map((_, i) => i),
    from,
    to,
  )) {
    shift(rows[i]!, y - tops[i]!);
    y += heights[i]! + gap;
  }
}

/**
 * While `rows[from]` is dragged to `place` (its index once dropped), the rows between slide up
 * or down by its height to make room; the rest stay.
 */
export function makeRoom(rows: HTMLElement[], from: number, place: number) {
  const dragged = rows[from];
  if (!dragged) return;
  const room =
    dragged.offsetHeight +
    (rows.length > 1
      ? Math.max(0, layoutTop(rows[1]!) - layoutTop(rows[0]!) - rows[0]!.offsetHeight)
      : 0);
  rows.forEach((el, i) => {
    if (i === from) return;
    const dy =
      from < place && i > from && i <= place
        ? -room
        : from > place && i >= place && i < from
          ? room
          : 0;
    if (shiftOf(el) !== dy) shift(el, dy);
  });
}

/** The index a dragged row lands at: how many of the others' middles are above its middle. */
export function dropIndex(rows: HTMLElement[], from: number, dy: number) {
  const dragged = rows[from];
  if (!dragged) return from;
  const mid = layoutTop(dragged) + dragged.offsetHeight / 2 + dy;
  return rows.filter((el, i) => i !== from && layoutTop(el) + el.offsetHeight / 2 < mid).length;
}

/**
 * After the list re-rendered: each row slides from where it was last shown (`seen`) to its
 * place in the new layout. Rows not in `seen` just appear.
 */
export function flip(
  rows: HTMLElement[],
  key: (el: HTMLElement) => string,
  seen: Map<string, number>,
) {
  for (const el of rows) shift(el, 0, false);
  let moved = false;
  for (const el of rows) {
    const was = seen.get(key(el));
    if (was == null) continue;
    const d = was - layoutTop(el);
    if (Math.abs(d) < 1) continue;
    shift(el, d, false);
    moved = true;
  }
  if (!moved || reducedMotion()) {
    for (const el of rows) if (shiftOf(el)) shift(el, 0, false);
    return;
  }
  // Draw the old places first, then slide home.
  void document.body.offsetHeight;
  for (const el of rows) if (shiftOf(el)) shift(el, 0);
}
