"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "./ui";

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
  "/customers": {
    line: (
      <path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.9M16 4.1a3.5 3.5 0 0 1 0 6.8" />
    ),
    shape: "M3 20v-1a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4v1zM9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    extra: "M21 20v-1a4 4 0 0 0-3-3.9M16 4.1a3.5 3.5 0 0 1 0 6.8",
  },
  "/invoices": {
    line: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3" />,
    shape: "M6 3h12v18l-3-2-3 2-3-2-3 2z",
    cut: "M9 8h6M9 12h6M9 16h3",
  },
  "/warranties": {
    line: <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6zM9 12l2 2 4-4" />,
    shape: "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z",
    cut: "M9 12l2 2 4-4",
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
export function TabBar({ links: all }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  const overflow = all.length > 5 ? all.slice(4) : [];
  const links = overflow.length ? [...all.slice(0, 4), { href: "/more", label: "More" }] : all;
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
              path === l.href ||
              path.startsWith(`${l.href}/`) ||
              (l.href === "/more" &&
                overflow.some((o) => path === o.href || path.startsWith(`${o.href}/`)));
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
                  <TabIcon href={l.href} selected={active} />
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

export function NavLinks({
  links,
  vertical = false,
  label = "Main",
  className,
}: {
  links: { href: string; label: string }[];
  vertical?: boolean;
  label?: string;
  className?: string;
}) {
  const path = usePathname();
  if (vertical) {
    return (
      <nav
        aria-label={label}
        className="-mx-4 flex flex-row gap-1 overflow-x-auto px-4 whitespace-nowrap md:mx-0 md:flex-col md:overflow-visible md:px-0 md:whitespace-normal"
      >
        {links.map((l) => {
          const active = path === l.href || path.startsWith(`${l.href}/`);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "min-h-11 content-center rounded-md px-3 font-medium",
                active ? "bg-text font-semibold text-bg" : "hover:bg-surface",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav aria-label={label} className={cx("flex flex-wrap gap-1", className)}>
      {links.map((l) => {
        const active = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "min-h-11 content-center rounded-md px-3 font-display text-[1.0625rem] font-semibold tracking-wide",
              active ? "bg-white/15" : "hover:bg-white/10",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
