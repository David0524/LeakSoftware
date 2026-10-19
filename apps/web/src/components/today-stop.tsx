"use client";

import { useState, type ReactNode } from "react";
import { cx } from "./ui";

/**
 * A stop on Today (owner, 2026-10-19: "keep these cards on Today collapsed except for the job
 * you are on. Then a tap on an old job or future job expands it"): one row (number, time,
 * customer, state) that opens to the address, notes, and buttons.
 */
export function TodayStop({
  label,
  number,
  current,
  done,
  summary,
  children,
}: {
  label: string;
  number: number;
  /** The stop you're on: open, and ringed. */
  current: boolean;
  done: boolean;
  summary: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(current);
  const body = `stop-${number}`;
  return (
    <section
      aria-label={label}
      className={cx("card", current && "ring-2 ring-link")}
      data-testid="today-stop"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={body}
        onClick={() => setOpen(!open)}
        className="flex min-h-14 w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span
          aria-hidden="true"
          className={cx(
            "grid size-8 shrink-0 place-items-center rounded-full font-display font-bold",
            done ? "bg-status-pass text-on-status" : current ? "bg-link text-bg" : "bg-bg",
          )}
        >
          {done ? (
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          ) : (
            number
          )}
        </span>
        <span
          className={cx("flex min-w-0 flex-1 flex-wrap items-center gap-x-2", done && "opacity-70")}
        >
          {summary}
        </span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={cx(
            "size-5 shrink-0 text-text-muted transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div id={body} className="space-y-1 px-3 pb-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}
