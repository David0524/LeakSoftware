"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

// Local helper: ui.tsx renders NavBar, so importing from it here would be circular.
const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/**
 * Phones: the iOS navigation bar (toolbars.md › large titles). The page's large title sits in
 * the content; once it scrolls under the bar, a small centered title fades in on a frosted
 * bar. Back sits on the left ("‹ Jobs") and the page's main action on the right.
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
  useEffect(() => {
    const el = document.getElementById(titleId);
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e!.isIntersecting), {
      rootMargin: "-52px 0px 0px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [titleId]);

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
          ) : null}
        </div>
        <p
          aria-hidden={!collapsed}
          className={cx(
            "max-w-[55vw] truncate text-[1.0625rem] font-semibold transition-opacity",
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
