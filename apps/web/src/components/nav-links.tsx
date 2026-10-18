"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { OfficeLink } from "@/lib/nav";
import { cx } from "./ui";

/** Whether the page at `path` is in this section (or one it holds, like Messages). */
const inSection = (path: string, l: OfficeLink) =>
  [l.href, ...(l.also ?? [])].some((h) => path === h || path.startsWith(`${h}/`));

/** The unread count on a section (iOS tab badge; the caller colors it), read as "N unread". */
function Badge({ count, className }: { count?: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={cx(
        "min-w-5 rounded-full px-1.5 text-center text-[0.75rem] leading-5 font-semibold tabular-nums",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}

interface Icon {
  /** The outline drawn when the tab isn't selected (and in the desktop lists). */
  line: ReactNode;
  /** Selected (iOS: the filled symbol): a solid shape, with its details cut out of it. */
  shape?: string;
  /** Lines cut out of the solid shape. */
  cut?: string;
  cutWidth?: number;
  /** Lines drawn on top of the shape as they are. */
  extra?: string;
}

const ICONS: Record<string, Icon> = {
  "/today": {
    line: (
      <path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
    ),
    shape: "M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z",
    cut: "M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  },
  "/jobs": {
    line: (
      <path d="M9 4h6M8 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2M9 11h6M9 15h4" />
    ),
    shape: "M6 4h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z",
    cut: "M9 11h6M9 15h4",
  },
  "/schedule": {
    line: (
      <path d="M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 12h3M8 16h3M13 12h3" />
    ),
    shape: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
    cut: "M4 8.5h16M8 12h3M8 16h3M13 12h3",
    extra: "M7 3v3M17 3v3",
  },
  "/messages": {
    line: <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z" />,
    shape: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z",
    cut: "M8 11h.01M12 11h.01M16 11h.01",
    cutWidth: 2.6,
  },
  "/customers": {
    line: (
      <path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.9M16 4.1a3.5 3.5 0 0 1 0 6.8" />
    ),
    shape: "M3 20v-1a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4v1zM9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    extra: "M21 20v-1a4 4 0 0 0-3-3.9M16 4.1a3.5 3.5 0 0 1 0 6.8",
  },
  "/chemicals": {
    line: (
      <path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 15h9" />
    ),
  },
  "/invoices": {
    line: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3" />,
    shape: "M6 3h12v18l-3-2-3 2-3-2-3 2z",
    cut: "M9 8h6M9 12h6M9 16h3",
  },
  "/dashboard": { line: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
  "/more": {
    line: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth="2.6" />
      </>
    ),
    shape: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z",
    cut: "M8 12h.01M12 12h.01M16 12h.01",
    cutWidth: 2.8,
  },
  "/settings": {
    line: (
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    ),
  },
};

/** A tab's symbol: the outline, or the filled version when it's the selected tab. */
function TabIcon({ href, selected }: { href: string; selected: boolean }) {
  const icon = ICONS[href];
  const id = `tab-cut-${href.slice(1)}`;
  const filled = selected && icon?.shape;
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {filled ? (
        <>
          {icon.cut ? (
            <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
              <rect width="24" height="24" fill="white" stroke="none" />
              <path d={icon.cut} stroke="black" strokeWidth={icon.cutWidth ?? 2} />
            </mask>
          ) : null}
          <path d={icon.shape} fill="currentColor" mask={icon.cut ? `url(#${id})` : undefined} />
          {icon.extra ? <path d={icon.extra} /> : null}
        </>
      ) : (
        icon?.line
      )}
    </svg>
  );
}

/**
 * Phones: the main sections as a tab bar along the bottom (iOS convention). With more than
 * five, the first four show and the rest are under More. As on iOS, the selected tab is the
 * filled symbol in the tint color; there is no highlight behind it.
 */
export function TabBar({ links: all }: { links: OfficeLink[] }) {
  const path = usePathname();
  const overflow = all.length > 5 ? all.slice(4) : [];
  const links: OfficeLink[] = overflow.length
    ? [...all.slice(0, 4), { href: "/more", label: "More" }]
    : all;
  return (
    // The full-width layer under the floating bar catches taps that miss it (the margins
    // beside it and the strip below it), so they never reach the page underneath. Its own
    // compositing layer keeps iOS Safari hit-testing the bar where it is drawn while the
    // page is still scrolling or the browser's toolbar is moving.
    <div
      data-testid="tab-bar-layer"
      className="fixed inset-x-0 bottom-0 z-30 transform-gpu touch-manipulation px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden"
    >
      <nav aria-label="Main" className="glass rounded-[28px] px-1">
        <ul className="flex">
          {links.map((l) => {
            const active =
              inSection(path, l) ||
              (l.href === "/more" && overflow.some((o) => inSection(path, o)));
            return (
              <li key={l.href} className="flex-1">
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-3xl text-[0.6875rem] font-medium",
                    active ? "text-link" : "text-text-muted",
                  )}
                >
                  <span className="relative">
                    <TabIcon href={l.href} selected={active} />
                    <Badge
                      count={l.badge}
                      className="absolute -top-1 left-4 bg-primary text-on-primary"
                    />
                  </span>
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** A tab in the desktop bar: muted text, the current one in the link color, underlined. */
const barLink = (active: boolean) =>
  cx(
    "relative inline-flex h-14 items-center gap-1.5 px-2 text-[0.9375rem] font-semibold lg:px-3",
    "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full",
    active ? "text-link after:bg-link" : "text-text-muted hover:text-text",
  );

/**
 * Wider screens: the main sections as tabs along the header (owner, 2026-10-18: "like
 * Stripe"), the rest under a More menu (a pull-down, as on iPadOS and macOS), and Settings as
 * a gear at the end of the row.
 */
export function DesktopNav({
  main,
  more,
  settings,
  action,
  className,
}: {
  main: OfficeLink[];
  more: OfficeLink[];
  settings: OfficeLink | null;
  /** The page-wide main action (New Job), just before the gear. */
  action?: ReactNode;
  className?: string;
}) {
  const path = usePathname();
  // The page the menu was opened on: it closes by itself on a new page.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (next: boolean | ((o: boolean) => boolean)) =>
    setOpenOn((typeof next === "function" ? next(open) : next) ? path : null);
  const menu = useRef<HTMLDivElement>(null);
  const moreActive = more.some((l) => inSection(path, l));

  // It also closes on a click outside it, or Escape.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpenOn(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenOn(null);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <nav aria-label="Main" className={cx("flex min-w-0 flex-1 items-center", className)}>
      {main.map((l) => {
        const active = inSection(path, l);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={barLink(active)}
          >
            {l.label}
            <Badge count={l.badge} className="bg-primary text-on-primary" />
          </Link>
        );
      })}
      {more.length ? (
        <div ref={menu} className="relative">
          <button
            type="button"
            aria-haspopup="true"
            aria-expanded={open}
            aria-controls="more-menu"
            onClick={() => setOpen((o) => !o)}
            className={barLink(moreActive || open)}
          >
            More
            <svg
              viewBox="0 0 24 24"
              className={cx("size-4 transition-transform", open && "rotate-180")}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {open ? (
            <ul
              id="more-menu"
              aria-label="More"
              className="absolute top-full left-0 z-40 mt-1 min-w-48 overflow-hidden rounded-xl bg-surface py-1 text-text shadow-lg ring-1 ring-black/10"
            >
              {more.map((l) => {
                const active = inSection(path, l);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "flex min-h-11 items-center gap-3 px-4 text-[1.0625rem]",
                        active ? "font-semibold text-link" : "hover:bg-text/[0.05]",
                      )}
                    >
                      <span className="text-text-muted [&_svg]:size-6">
                        <TabIcon href={l.href} selected={false} />
                      </span>
                      {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="ml-auto flex items-center pr-1">{action}</div>
      {settings ? (
        <Link
          href={settings.href}
          aria-label="Settings"
          title="Settings"
          aria-current={inSection(path, settings) ? "page" : undefined}
          className={cx(barLink(inSection(path, settings)), "w-11 justify-center px-0 lg:px-0")}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {ICONS["/settings"]?.line}
          </svg>
        </Link>
      ) : null}
    </nav>
  );
}
