"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { DriveChip } from "./drive-chip";
import { KeyIcon } from "./icons";
import {
  DoLaterButton,
  DoLaterRow,
  ReorderControls,
  ReorderHandle,
  useDoLater,
  useTodayReorder,
  type StopMoves,
} from "./today-reorder";
import { cx } from "./ui";

/**
 * A stop on Today (owner, 2026-10-19: "keep these cards on Today collapsed except for the job
 * you are on. Then a tap on an old job or future job expands it"): one row (number, time,
 * customer, state) that opens to the address, notes, and buttons, with the name then a link to
 * the job. The day's stops touch in one block (owner, 2026-10-21; docs/design/
 * 2026-10-21-schedule-tile.md, Today): line 1 ends with the drive chip and the chevron, and the
 * Now, status and lock pills start line 2, before the access note.
 */
export function TodayStop({
  label,
  number,
  current,
  done,
  time,
  name,
  href,
  pills,
  driveMin,
  hairline = false,
  access,
  startOpen = current,
  moves,
  children,
}: {
  /**
   * Its moves on today's route, when the person viewing may change the order (owner,
   * 2026-10-20): Do Later in its actions, and Reorder's controls. No swipe actions on the row
   * (owner, 2026-10-21: Today had "too many gestures"); every action is a visible button.
   */
  moves?: StopMoves;
  label: string;
  /** Open at first; the stop you're on, unless Today's card already shows it. */
  startOpen?: boolean;
  number: number;
  /** The stop you're on: its number blue, its tile tinted. */
  current: boolean;
  done: boolean;
  time: ReactNode;
  /** The customer: once the card is open, their name opens the job (owner, 2026-10-20). */
  name: string;
  href: string;
  /** Now, the status label, the lock: at the start of line 2. Null when there are none. */
  pills?: ReactNode;
  /** The drive into the stop (from the start for the first): its chip. Null when unknown. */
  driveMin?: number | null;
  /** A hairline above the tile, from after the number (not on the block's first tile). */
  hairline?: boolean;
  /**
   * The pool's access notes (gate code, which gate, dogs), shown on the card open or closed
   * (owner, 2026-10-20): one line while closed, all of it open.
   */
  access?: string | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  const body = `stop-${number}`;
  const reorder = useTodayReorder();
  const doLater = useDoLater(moves?.jobId ?? "");
  const editing = !!(reorder?.editing && moves && !done);
  // Closed (or in Reorder), the row shows its Undo under the name (where an open row's button
  // is).
  const undoShown = !!doLater?.notice && (!open || editing);
  const note = access?.trim() && !done && !editing ? access.trim() : null;
  return (
    <DoLaterRow value={moves ? doLater : null}>
      <section
        aria-label={label}
        // Touching tiles can't each have a ring: the stop you're on is tinted (link at 8%),
        // opaque so a tile lifted in Reorder doesn't show the ones under it.
        className={cx(
          "relative",
          current && !editing
            ? "bg-[color-mix(in_srgb,var(--lb-link)_8%,var(--lb-surface))]"
            : "bg-surface",
        )}
        data-testid="today-stop"
        data-reorder-row={editing || undefined}
      >
        <>
          {hairline ? (
            <span
              aria-hidden="true"
              className="absolute top-0 right-0 left-[3.25rem] h-[0.5px] bg-separator"
            />
          ) : null}
          {/* The rest of the row (number, time, chevron) opens and closes the card; the chevron
              is its button for keyboards and screen readers. The name is a link to the job
              instead of an Open Job button (owner, 2026-10-20: "We're wasting space by keeping
              as a new button"). In Reorder, the drag handle takes the chevron's place. */}
          <div
            onClick={() => !editing && setOpen(!open)}
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
              className={cx(
                "@container flex min-w-0 flex-1 flex-wrap items-center gap-x-2",
                done && "opacity-70",
              )}
            >
              <span className="font-display text-[1.0625rem] font-bold whitespace-nowrap">
                {time}
              </span>
              {/* The name opens the job, open or closed (owner, 2026-10-20). With large text (the
              row under 9 of its letters wide) it takes its own line under the time and wraps,
              without its chevron, rather than shrinking to a letter or two. */}
              <Link
                href={href}
                onClick={(e) => e.stopPropagation()}
                className="-my-2 flex min-h-11 min-w-0 flex-1 items-center gap-0.5 font-semibold text-link @max-[9em]:my-0 @max-[9em]:basis-full"
              >
                <span className="truncate @max-[9em]:break-words @max-[9em]:whitespace-normal">
                  {name}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="size-4 shrink-0 @max-[9em]:hidden"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            </span>
            {driveMin != null ? (
              <DriveChip minutes={driveMin} className={done ? "opacity-70" : undefined} />
            ) : null}
            {editing ? (
              <ReorderHandle moves={moves!} />
            ) : (
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
            )}
          </div>
          {editing ? <ReorderControls moves={moves!} /> : null}
          {/* Line 2: the pills that sat at line 1's end (Now, the status, the lock), then the
              access notes (gate code, which gate, dogs), open or closed (owner, 2026-10-20):
              one line closed, all of it open. A tile with neither stays one line. */}
          {pills || note ? (
            <div
              className={cx(
                "-mt-1 flex items-start gap-x-2 px-3 pb-2 pl-[3.25rem]",
                done && "opacity-70",
              )}
            >
              {pills ? <span className="flex shrink-0 items-center gap-1.5">{pills}</span> : null}
              {note ? (
                <p className="flex min-w-0 flex-1 items-start gap-1.5 text-[0.9375rem] font-medium text-text">
                  <KeyIcon className="mt-0.5 size-[1.125rem] shrink-0 text-status-warning" />
                  <span className={cx("min-w-0", open ? "whitespace-pre-line" : "truncate")}>
                    <span className="sr-only">Access: </span>
                    {note}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
          {undoShown && moves ? (
            <div className="px-3 pb-2 pl-[3.25rem]">
              <DoLaterButton jobId={moves.jobId} customer={name} show={false} />
            </div>
          ) : null}
          {open && !editing ? (
            <div id={body} className="space-y-1 px-3 pb-3">
              {children}
            </div>
          ) : null}
        </>
      </section>
    </DoLaterRow>
  );
}
