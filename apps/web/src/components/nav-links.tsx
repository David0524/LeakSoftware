"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const ICONS: Record<string, React.ReactNode> = {
  "/today": (
    <path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
  ),
  "/jobs": (
    <path d="M9 4h6M8 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2M9 11h6M9 15h4" />
  ),
  "/schedule": (
    <path d="M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 12h3M8 16h3M13 12h3" />
  ),
  "/customers": (
    <path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.9M16 4.1a3.5 3.5 0 0 1 0 6.8" />
  ),
  "/invoices": <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3" />,
  "/warranties": <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6zM9 12l2 2 4-4" />,
  "/dashboard": <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  "/more": <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />,
  "/settings": (
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  ),
};

/** Pages that show the floating New Job button on phones. */
const NEW_JOB_PAGES = ["/today", "/jobs", "/schedule"];

/**
 * Phones: the main sections as a tab bar along the bottom (iOS convention). With more than
 * five, the first four show and the rest are under More.
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
      {/* New Job floats above the tab bar where people start jobs, instead of taking a row. */}
      {NEW_JOB_PAGES.includes(path) ? (
        <Link
          href="/jobs/new"
          className="absolute right-4 bottom-full mb-1 inline-flex min-h-12 items-center gap-1.5 rounded-full bg-primary pr-5 pl-4 font-display text-[1.0625rem] font-bold tracking-wide text-on-primary shadow-lg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus active:brightness-95"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Job
        </Link>
      ) : null}
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
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-3xl text-[0.6875rem] font-semibold",
                    active ? "bg-link/10 text-link" : "text-text",
                  )}
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
                    {ICONS[l.href]}
                  </svg>
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
