"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { KeyIcon } from "./icons";
import { cx } from "./ui";

/**
 * A stop on Today (owner, 2026-10-19: "keep these cards on Today collapsed except for the job
 * you are on. Then a tap on an old job or future job expands it"): one row (number, time,
 * customer, state) that opens to the address, notes, and buttons, with the name then a link to
 * the job.
 */
export function TodayStop({
  label,
  number,
  current,
  done,
  time,
  name,
  href,
  extra,
  access,
  startOpen = current,
  children,
}: {
  label: string;
  /** Open at first; the stop you're on, unless Today's card already shows it. */
  startOpen?: boolean;
  number: number;
  /** The stop you're on: open, and ringed. */
  current: boolean;
  done: boolean;
  time: ReactNode;
  /** The customer: once the card is open, their name opens the job (owner, 2026-10-20). */
  name: string;
  href: string;
  /** State after the name (a badge, a lock). */
  extra?: ReactNode;
  /**
   * The pool's access notes (gate code, which gate, dogs), shown on the card open or closed
   * (owner, 2026-10-20): one line while closed, all of it open.
   */
  access?: string | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  const body = `stop-${number}`;
  return (
    <section
      aria-label={label}
      className={cx("card", current && "ring-2 ring-link")}
      data-testid="today-stop"
    >
      {/* The rest of the row (number, time, chevron) opens and closes the card; the chevron is
          its button for keyboards and screen readers. The name is a link to the job instead of
          an Open Job button (owner, 2026-10-20: "We're wasting space by keeping as a new
          button"). */}
      <div
        onClick={() => setOpen(!open)}
        className="flex min-h-14 w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
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
          <span className="font-display text-[1.0625rem] font-bold">{time}</span>
          {/* The name opens the job, open or closed (owner, 2026-10-20). */}
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            className="-my-2 flex min-h-11 min-w-0 flex-1 items-center gap-0.5 font-semibold text-link"
          >
            <span className="truncate">{name}</span>
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
          {extra}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={body}
          aria-label={open ? `Hide ${name}` : `Show ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={cx(
              "size-5 text-text-muted transition-transform motion-reduce:transition-none",
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
      </div>
      {access?.trim() && !done ? (
        <p className="-mt-1 flex items-start gap-1.5 px-3 pb-2 pl-[3.25rem] text-[0.9375rem] font-medium text-text">
          <KeyIcon className="mt-0.5 size-[1.125rem] shrink-0 text-status-warning" />
          <span className={cx("min-w-0", open ? "whitespace-pre-line" : "truncate")}>
            <span className="sr-only">Access: </span>
            {access.trim()}
          </span>
        </p>
      ) : null}
      {open ? (
        <div id={body} className="space-y-1 px-3 pb-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}
