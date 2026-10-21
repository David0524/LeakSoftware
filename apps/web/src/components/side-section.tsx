"use client";

import type { ReactNode } from "react";
import { cx } from "./ui";

/**
 * A sidebar section's title (Week's Needs a Time and Customers to Add; owner, 2026-10-20): the
 * name and its count as a disclosure button that collapses the section, as a sidebar's groups
 * do on iPad and Mac (sidebars.md), with an optional action at its end.
 */
export function SideSectionTitle({
  id,
  title,
  count,
  open,
  onToggle,
  action,
}: {
  /** The collapsing list's id. */
  id: string;
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="min-w-0 flex-1 font-display text-xl font-bold">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="-ml-1 flex min-h-11 w-full items-center gap-1.5 rounded-lg pl-1 text-left focus-visible:outline-3 focus-visible:outline-focus"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={cx(
              "size-4 shrink-0 text-text-muted transition-transform motion-reduce:transition-none",
              open && "rotate-90",
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span className="min-w-0 truncate">{title}</span>
          <span className="font-sans text-[0.9375rem] font-normal text-text-muted tabular-nums">
            {count}
          </span>
        </button>
      </h2>
      {action}
    </div>
  );
}
