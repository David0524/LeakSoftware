"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Logo } from "./logo";

/**
 * The phone tab bar's pages. The logo parks right above their large title, in the page, and
 * scrolls away with it; the bar keeps only its buttons (owner, 2026-10-21: "The logo needs to
 * park over the title"). Pushed pages keep Back.
 */
const TAB_ROOTS = ["/today", "/jobs", "/schedule", "/messages", "/more"];

// Local helper: ui.tsx renders NavBar, so importing from it here would be circular.
const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/**
 * Phones, a tab's own page: the logo above the large title, left-aligned with it (28 pt tall,
 * 6 pt above it), part of the title block so it scrolls away with it. The light or reverse
 * lockup follows the website's appearance; read once as "Sundeck Pro".
 */
export function TabLogo() {
  const path = usePathname();
  if (!TAB_ROOTS.includes(path)) return null;
  return (
    <div data-tab-logo className="mb-1.5 flex h-7 items-center sm:hidden">
      <Logo height={28} />
    </div>
  );
}

/** Pages that keep the large-title bar as it is (no collapse while they're shown). */
let stills = 0;
const listeners = new Set<() => void>();
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

/**
 * Keep the navigation bar from collapsing to its small title while `on` (owner, 2026-10-20:
 * "When on the findings page, it doesn't make sense for the nav bar to shrink on scroll since
 * it's sitting on a tile").
 */
export function useStillNavBar(on: boolean) {
  useEffect(() => {
    if (!on) return;
    stills += 1;
    listeners.forEach((f) => f());
    return () => {
      stills -= 1;
      listeners.forEach((f) => f());
    };
  }, [on]);
}

/**
 * Phones: the iOS navigation bar (toolbars.md › large titles). The page's large title sits in
 * the content; once it scrolls under the bar, a small centered title fades in on a frosted
 * bar. Back sits on the left ("‹ Jobs") and the page's main action on the right. The tab bar's
 * own pages (Today, Jobs, Schedule, Messages, More) show the logo above the large title, in
 * the page (TabLogo), never in the bar (owner, 2026-10-21).
 *
 * Without Back and without the logo, the large title sits in the bar's row, left of the
 * action, as in Apple's App Store and Music (owner, 2026-10-20: "push up towards where the
 * plus button is"). On the tab bar's pages the bar's row holds only the buttons, and the logo
 * and the title sit under it with the page's full width (owner, 2026-10-21). The bar sets `--nav-action` on the title
 * to the action's width, so a long or enlarged title wraps between words before it reaches the
 * "+"; when one of its words is wider than the room left (very large text), the title moves to
 * its own row under the bar instead.
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
  const [past, setPast] = useState(false);
  const still = useSyncExternalStore(
    subscribe,
    () => stills > 0,
    () => false,
  );
  const actionRef = useRef<HTMLDivElement>(null);
  // Beside the action, unless a word of the title can't fit there (very large text): then it
  // takes its own row under the bar, as with Back.
  const [stacked, setStacked] = useState(false);
  const path = usePathname();
  const brand = !back && TAB_ROOTS.includes(path);
  const inline = !back && !brand && !stacked;
  useEffect(() => {
    const el = document.getElementById(titleId);
    if (!el) return;
    // Under the bar, the title has gone once it passes under it; in the bar's row, once half
    // of it has scrolled off the top. A page whose content fits (it can't scroll the title
    // away) never collapses; only a real scroll past the large title does.
    const io = new IntersectionObserver(
      ([e]) =>
        setPast(
          (inline ? e!.intersectionRatio < 0.5 : !e!.isIntersecting) &&
            document.documentElement.scrollHeight - window.innerHeight >
              el.getBoundingClientRect().height + (inline ? 0 : 52),
        ),
      inline ? { threshold: [0, 0.5, 1] } : { rootMargin: "-52px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [titleId, inline]);
  const collapsed = past && !still;
  useEffect(() => {
    const el = document.getElementById(titleId);
    const row = el?.closest<HTMLElement>("[data-page-header]");
    const action = actionRef.current;
    if (back || !el || !row || !action) return;
    const measure = () => {
      const room = (el.parentElement ?? el).clientWidth - action.getBoundingClientRect().width;
      const words = [...el.children].map((w) => w.getBoundingClientRect().width);
      // Under the logo, always its own row.
      const stack = brand || Math.max(0, ...words) > room;
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
  }, [titleId, back, brand]);

  return (
    <div
      data-nav-brand={brand ? "" : undefined}
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
            // The large title's face at 17 pt, so the title reads the same scrolled or not
            // (owner, 2026-10-20: "'Schedule' has different fonts depending on if the map is
            // hidden or not").
            "truncate font-display text-[1.0625rem] font-bold transition-opacity",
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
