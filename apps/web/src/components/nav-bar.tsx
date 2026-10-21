"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Logo } from "./logo";

/** The phone tab bar's pages. Their bars carry the logo at the left; pushed pages keep Back. */
const TAB_ROOTS = ["/today", "/jobs", "/schedule", "/messages", "/more"];

// Local helper: ui.tsx renders NavBar, so importing from it here would be circular.
const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

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
 * own pages (Today, Jobs, Schedule, Messages, More) show the logo there instead (owner,
 * 2026-10-21: "Incorporate this logo with the text in the top left of each main page").
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
  useEffect(() => {
    const el = document.getElementById(titleId);
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) =>
        // A page whose content fits (it can't scroll the title away) never collapses; only a
        // real scroll past the large title does.
        setPast(
          !e!.isIntersecting &&
            document.documentElement.scrollHeight - window.innerHeight >
              el.getBoundingClientRect().height + 52,
        ),
      { rootMargin: "-52px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [titleId]);
  const collapsed = past && !still;
  const path = usePathname();
  const brand = !back && TAB_ROOTS.includes(path);

  return (
    <div
      className={cx(
        "nav-main fixed inset-x-0 top-0 z-30 pt-[env(safe-area-inset-top)] transition-colors sm:hidden",
        collapsed ? "glass-bar" : "bg-transparent",
      )}
    >
      <div className="grid h-11 grid-cols-[1fr_auto_1fr] items-center px-2">
        <div className="min-w-0 justify-self-start">
          {back ? (
            <Link
              href={back.href}
              className="flex min-h-11 items-center gap-0.5 rounded-full pr-2 text-link"
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
              <span className="truncate">{back.label}</span>
            </Link>
          ) : brand ? (
            // 24 pt tall like the leading brand in Apple's own apps; the light or reverse
            // lockup follows the website's appearance. Read once as "Sundeck Pro".
            <span className="flex h-11 items-center pl-2">
              <Logo height={24} />
            </span>
          ) : null}
        </div>
        <p
          aria-hidden={!collapsed}
          className={cx(
            // The large title's face at 17 pt, so the title reads the same scrolled or not
            // (owner, 2026-10-20: "'Schedule' has different fonts depending on if the map is
            // hidden or not").
            brand ? "max-w-[calc(100vw-15rem)]" : "max-w-[55vw]",
            "truncate font-display text-[1.0625rem] font-bold transition-opacity",
            collapsed ? "opacity-100" : "opacity-0",
          )}
        >
          {title}
        </p>
        <div className="flex min-w-0 items-center gap-1 justify-self-end">{action}</div>
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
