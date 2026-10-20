"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Local helper: ui.tsx renders NavBar, so importing from it here would be circular.
const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/**
 * Phones: the iOS navigation bar (toolbars.md › large titles). The page's large title sits in
 * the content; once it scrolls under the bar, a small centered title fades in on a frosted
 * bar. Back sits on the left ("‹ Jobs") and the page's main action on the right.
 *
 * Without Back (the tab roots), the large title sits in the bar's row, left of the action, as
 * in Apple's App Store and Music (owner, 2026-10-20: "push up towards where the plus button
 * is"). The bar sets `--nav-action` on the title to the action's width, so a long or enlarged
 * title wraps between words before it reaches the "+"; when one of its words is wider than the
 * room left (very large text), the title moves to its own row under the bar instead.
 */
export function NavBar({
  title,
  titleId,
  back,
  action,
}: {
  title: string;
  /** The large title's element id, watched to know when it has scrolled away. */
  titleId: string;
  back?: { href: string; label: string };
  action?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const actionRef = useRef<HTMLDivElement>(null);
  // Beside the action, unless a word of the title can't fit there (very large text): then it
  // takes its own row under the bar, as with Back.
  const [stacked, setStacked] = useState(false);
  const inline = !back && !stacked;
  useEffect(() => {
    const el = document.getElementById(titleId);
    if (!el) return;
    // Under the bar, the title has gone once it passes under it; in the bar's row, once half
    // of it has scrolled off the top.
    const io = new IntersectionObserver(
      ([e]) => setCollapsed(inline ? e!.intersectionRatio < 0.5 : !e!.isIntersecting),
      inline ? { threshold: [0, 0.5, 1] } : { rootMargin: "-52px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [titleId, inline]);
  useEffect(() => {
    const el = document.getElementById(titleId);
    const row = el?.closest<HTMLElement>("[data-page-header]");
    const action = actionRef.current;
    if (back || !el || !row || !action) return;
    const measure = () => {
      const room = (el.parentElement ?? el).clientWidth - action.getBoundingClientRect().width;
      const words = [...el.children].map((w) => w.getBoundingClientRect().width);
      const stack = Math.max(0, ...words) > room;
      setStacked(stack);
      row.toggleAttribute("data-stacked", stack);
      el.style.setProperty(
        "--nav-action",
        stack ? "0px" : `${action.getBoundingClientRect().width}px`,
      );
    };
    const ro = new ResizeObserver(measure);
    ro.observe(action);
    ro.observe(el);
    ro.observe(row);
    return () => {
      ro.disconnect();
      row.removeAttribute("data-stacked");
      el.style.removeProperty("--nav-action");
    };
  }, [titleId, back]);

  return (
    <div
      className={cx(
        "nav-main fixed inset-x-0 top-0 z-30 pt-[env(safe-area-inset-top)] transition-colors sm:hidden",
        collapsed ? "glass-bar" : "bg-transparent",
      )}
    >
      {/* Large text (owner, 2026-10-20), as iOS does: the bar grows in height with the text,
          the title truncates, and the back label gives way before it collides: truncated
          first, then only the chevron (the cell is a container, so the label hides once its
          column is under about 3.5 of its own letters wide). The action column keeps its
          button's width; the title's column shrinks instead. */}
      <div className="grid min-h-11 grid-cols-[minmax(2.75rem,1fr)_minmax(0,auto)_minmax(2.75rem,1fr)] items-center px-2">
        <div className="@container min-w-0">
          {back ? (
            <Link
              href={back.href}
              aria-label={back.label}
              className="inline-flex min-h-11 max-w-full min-w-11 items-center gap-0.5 rounded-full pr-2 text-link"
            >
              <svg
                viewBox="0 0 12 20"
                className="h-5 w-3 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 2 2 10l8 8" />
              </svg>
              <span className="truncate @max-[3.5em]:hidden">{back.label}</span>
            </Link>
          ) : null}
        </div>
        <p
          aria-hidden={!collapsed}
          className={cx(
            "truncate text-[1.0625rem] font-semibold transition-opacity",
            // Hidden, it takes no room, so "‹ Jobs" shows in full above the large title.
            collapsed ? "max-w-[55vw] opacity-100" : "max-w-0 opacity-0",
          )}
        >
          {title}
        </p>
        <div ref={actionRef} className="flex items-center gap-1 justify-self-end">
          {action}
        </div>
      </div>
    </div>
  );
}

/**
 * A round "+" for the navigation bar (New Job and the like), named for screen readers. With
 * onClick instead of href it is a button (e.g. opening an Add sheet).
 */
export function NavPlus({
  href,
  onClick,
  label,
}: {
  label: string;
} & ({ href: string; onClick?: never } | { href?: never; onClick: () => void })) {
  const className = "grid size-11 place-items-center rounded-full text-link active:bg-link/10";
  const plus = (
    <svg
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
  return href != null ? (
    <Link href={href} aria-label={label} className={className}>
      {plus}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} className={className}>
      {plus}
    </button>
  );
}
