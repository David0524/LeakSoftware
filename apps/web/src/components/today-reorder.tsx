"use client";

import { createContext, useContext, useRef, useState, useTransition, type ReactNode } from "react";
import type { JobChange, TodayMove } from "@leakbook/core";
import { moveTodayStop, undoTodayMove, type TodayMoveResult } from "@/app/actions/routes";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";
import { SWIPE_ACTION } from "./swipe-row";
import { useUndoWindow } from "./undo";
import { buttonClass, cx } from "./ui";

// Today: change the order of stops (owner, 2026-10-20; docs/plans/today-reorder.md). Do Later
// on a stop moves it after every stop still to do, with an inline Undo for five seconds; Reorder
// puts the list in edit mode, as iOS Reminders does: a drag handle and Move Up / Move Down on
// each stop that can move, a lock and the reason on each that can't. Each move saves at once.

/** What a stop row offers: its moves, or why it can't move. */
export interface StopMoves {
  jobId: string;
  customer: string;
  /** "Started", "Locked", "Time locked", or null when it can move. */
  lock: string | null;
  up: boolean;
  down: boolean;
  later: boolean;
}

interface Reorder {
  tech: string;
  editing: boolean;
  setEditing: (on: boolean) => void;
  pending: boolean;
  error: string | null;
  move: (jobId: string, to: TodayMove) => void;
}

const ReorderContext = createContext<Reorder | null>(null);

const offline = (call: Promise<TodayMoveResult>) => whenOffline(call, { error: NO_CONNECTION });

/** Today's stops for one tech's day, when the person viewing may change their order. */
export function TodayReorderProvider({ tech, children }: { tech: string; children: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const move = (jobId: string, to: TodayMove) =>
    start(async () => {
      const r = await offline(moveTodayStop({ job: jobId, tech, to }));
      setError(r.error ?? null);
    });
  return (
    <ReorderContext.Provider
      value={{
        tech,
        editing,
        setEditing: (on) => {
          setEditing(on);
          setError(null);
        },
        pending,
        error,
        move,
      }}
    >
      <div data-editing={editing || undefined}>{children}</div>
    </ReorderContext.Provider>
  );
}

export const useTodayReorder = () => useContext(ReorderContext);

/** Reorder at the end of the day's summary line; Done while the list is in edit mode. */
export function ReorderToggle() {
  const r = useTodayReorder();
  if (!r) return null;
  return (
    <>
      {" · "}
      <button
        type="button"
        onClick={() => r.setEditing(!r.editing)}
        aria-pressed={r.editing}
        className={cx(
          "-my-3 inline-flex min-h-11 items-center px-1 text-link",
          r.editing ? "font-bold" : "font-semibold",
        )}
      >
        {r.editing ? "Done" : "Reorder"}
      </button>
    </>
  );
}

/** A move that went wrong in Reorder, under the summary line. */
export function ReorderStatus() {
  const r = useTodayReorder();
  if (!r?.editing || !r.error) return null;
  return (
    <p role="alert" className="mb-3 text-[0.9375rem] text-status-fail">
      {r.error}
    </p>
  );
}

/** Left out while Reorder is on (Today's card: the list is what's being edited). */
export function HideWhileReordering({ children }: { children: ReactNode }) {
  const r = useTodayReorder();
  return r?.editing ? null : <>{children}</>;
}

/** "Moved to 2:15 PM." reads as "Moved to 2:15 PM" beside Undo; a longer message stays whole. */
export const movedText = (message: string | undefined) =>
  !message ? "Moved" : /^Moved( to [^.]*)?\.$/.test(message) ? message.slice(0, -1) : message;

export interface DoLater {
  run: () => void;
  undo: () => void;
  pending: boolean;
  error: string | null;
  /** While the five seconds to Undo are open: what happened. */
  notice: string | null;
}

/** Do Later for one stop: the move, then five seconds to Undo it (the saved values go back). */
export function useDoLater(jobId: string): DoLater | null {
  const r = useTodayReorder();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; undo: JobChange[] } | null>(null);
  const timer = useUndoWindow();
  if (!r) return null;
  return {
    pending,
    error,
    notice: timer.open && done ? done.text : null,
    run: () =>
      start(async () => {
        const res = await offline(moveTodayStop({ job: jobId, tech: r.tech, to: "later" }));
        setError(res.error ?? null);
        if (res.error) return;
        setDone({ text: movedText(res.message), undo: res.undo ?? [] });
        timer.start();
      }),
    undo: () =>
      start(async () => {
        if (!done) return;
        const res = done.undo.length
          ? await offline(undoTodayMove(r.tech, done.undo))
          : ({} as TodayMoveResult);
        setError(res.error ?? null);
        if (!res.error) timer.cancel();
      }),
  };
}

const RowContext = createContext<DoLater | null>(null);
/** A stop row's Do Later, shared by its swipe action and its button. */
export const DoLaterRow = RowContext.Provider;

/**
 * The Do Later button, and in its place for five seconds, "Moved to 2:15 PM" and Undo. In a
 * stop row it shares the row's Do Later (the swipe action's); on Today's card it has its own.
 */
export function DoLaterButton({
  jobId,
  customer,
  show,
  onWater = false,
}: {
  jobId: string;
  customer: string;
  /** False when Do Later would do nothing (already last, or it can't move). */
  show: boolean;
  /** On Today's water-blue card. */
  onWater?: boolean;
}) {
  const row = useContext(RowContext);
  const own = useDoLater(jobId);
  const d = row ?? own;
  if (!d) return null;
  if (d.notice)
    return (
      <span role="status" className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cx("text-[0.9375rem]", onWater ? "text-white" : "text-text-muted")}>
          {d.notice}
        </span>
        <button
          type="button"
          disabled={d.pending}
          onClick={d.undo}
          aria-label={`Undo Do Later for ${customer}`}
          className={
            onWater
              ? "inline-flex min-h-11 items-center rounded-full bg-white px-5 text-[1.0625rem] font-semibold text-water disabled:opacity-60"
              : buttonClass("secondary", "min-h-11 px-5")
          }
        >
          {d.pending ? "Undoing…" : "Undo"}
        </button>
        {d.error ? <DoLaterError error={d.error} onWater={onWater} /> : null}
      </span>
    );
  if (!show) return d.error ? <DoLaterError error={d.error} onWater={onWater} /> : null;
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={d.pending}
        onClick={d.run}
        aria-label={`Do Later for ${customer}`}
        className={
          onWater
            ? "inline-flex min-h-11 items-center justify-center rounded-full bg-white/18 px-5 text-[1.0625rem] font-semibold text-white transition-colors hover:bg-white/28 disabled:opacity-60"
            : buttonClass("secondary", "min-h-11 px-5")
        }
      >
        {d.pending ? "Moving…" : "Do Later"}
      </button>
      {d.error ? <DoLaterError error={d.error} onWater={onWater} /> : null}
    </span>
  );
}

function DoLaterError({ error, onWater }: { error: string; onWater: boolean }) {
  return (
    <span
      role="alert"
      className={cx("text-[0.9375rem]", onWater ? "font-semibold text-white" : "text-status-fail")}
    >
      {error}
    </span>
  );
}

/**
 * Do Later as one of a row's swipe actions (beside Call and Directions), sharing the row's Do
 * Later (its Undo shows on the row).
 */
export function DoLaterSwipeAction({ customer }: { customer: string }) {
  const d = useContext(RowContext);
  if (!d) return null;
  return (
    <button
      type="button"
      disabled={d.pending}
      onClick={d.run}
      aria-label={`Do Later for ${customer}`}
      className={cx(SWIPE_ACTION, "bg-water")}
    >
      Do Later
    </button>
  );
}

/**
 * A stop's controls in Reorder, under its row: a lock and the reason when it can't move;
 * otherwise Move Up and Move Down, the visible, accessible alternative to dragging the handle.
 */
export function ReorderControls({ moves }: { moves: StopMoves }) {
  const r = useTodayReorder();
  if (!r) return null;
  if (moves.lock)
    return (
      <p
        className="flex min-h-11 items-center gap-1.5 px-3 pb-2 pl-[3.25rem] text-[0.9375rem] font-medium text-text-muted"
        data-testid="reorder-lock"
      >
        <LockIcon />
        {moves.lock}
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pl-[3.25rem]">
      <button
        type="button"
        disabled={r.pending || !moves.up}
        onClick={() => r.move(moves.jobId, "up")}
        aria-label={`Move Up ${moves.customer}`}
        className={buttonClass("secondary", "min-h-11 gap-1.5 px-4")}
      >
        <Arrow up />
        Move Up
      </button>
      <button
        type="button"
        disabled={r.pending || !moves.down}
        onClick={() => r.move(moves.jobId, "down")}
        aria-label={`Move Down ${moves.customer}`}
        className={buttonClass("secondary", "min-h-11 gap-1.5 px-4")}
      >
        <Arrow />
        Move Down
      </button>
    </div>
  );
}

/**
 * The drag handle (≡) at a movable stop's trailing edge in Reorder. The row follows the finger
 * or pointer; on release it goes to the place among the stops still to do where it was let go.
 * Rows that take part are marked `data-reorder-row` (stops still to do, in order).
 */
export function ReorderHandle({ moves }: { moves: StopMoves }) {
  const r = useTodayReorder();
  const drag = useRef<{ y0: number; mid: number; row: HTMLElement; rows: HTMLElement[] } | null>(
    null,
  );
  if (!r) return null;
  if (moves.lock) return <span aria-hidden="true" className="size-11 shrink-0" />;
  const lift = (row: HTMLElement, on: boolean) => {
    row.style.position = on ? "relative" : "";
    row.style.zIndex = on ? "20" : "";
    row.style.boxShadow = on ? "0 8px 24px rgb(0 0 0 / 0.18)" : "";
    if (!on) row.style.transform = "";
  };
  return (
    <button
      type="button"
      // Dragging only: Move Up and Move Down below do the same for keyboards and VoiceOver.
      tabIndex={-1}
      aria-hidden="true"
      disabled={r.pending}
      data-testid="reorder-handle"
      className="-mr-2 grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-full text-text-muted active:cursor-grabbing"
      onPointerDown={(e) => {
        const row = e.currentTarget.closest<HTMLElement>("[data-reorder-row]");
        if (!row || r.pending) return;
        e.preventDefault();
        const box = row.getBoundingClientRect();
        drag.current = {
          y0: e.clientY,
          mid: box.top + box.height / 2,
          row,
          rows: [...document.querySelectorAll<HTMLElement>("[data-reorder-row]")],
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        lift(row, true);
      }}
      onPointerMove={(e) => {
        const g = drag.current;
        if (g) g.row.style.transform = `translateY(${e.clientY - g.y0}px)`;
      }}
      onPointerUp={(e) => {
        const g = drag.current;
        if (!g) return;
        drag.current = null;
        const mid = g.mid + (e.clientY - g.y0);
        const place = g.rows
          .filter((x) => x !== g.row)
          .filter((x) => {
            const b = x.getBoundingClientRect();
            return b.top + b.height / 2 < mid;
          }).length;
        lift(g.row, false);
        if (place !== g.rows.indexOf(g.row)) r.move(moves.jobId, place);
      }}
      onPointerCancel={() => {
        const g = drag.current;
        drag.current = null;
        if (g) lift(g.row, false);
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      >
        <path d="M4 8h16M4 12h16M4 16h16" />
      </svg>
    </button>
  );
}

function Arrow({ up = false }: { up?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={up ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6"} />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-[1.125rem] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
