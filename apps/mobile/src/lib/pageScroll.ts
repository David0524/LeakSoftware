// Pages that fit don't scroll (owner, 2026-10-20: "When on the findings page, it doesn't make
// sense for the nav bar to shrink on scroll since it's sitting on a tile"): with nothing to
// scroll, a bounce or an overscroll never shrinks the large title. Pure, so it's tested without a
// phone.

/** Whether a page's content fits its scroll view (a point of slack for rounding). */
export function pageFits(contentHeight: number, viewHeight: number): boolean {
  if (viewHeight <= 0 || contentHeight <= 0) return false;
  return contentHeight <= viewHeight + 1;
}
