"use client";

import { useCallback, useState, useTransition } from "react";
import {
  planWeek,
  undoPlanWeek,
  type WeekPlanResult,
  type WeekUndoRow,
} from "@/app/actions/week-plan";
import { Sheet } from "./sheet";
import { showBanner } from "./top-banner";
import { Button, cx } from "./ui";

// Plan Week (owner, 2026-10-20, docs/plans/route-maps.md: "build routes from scratch"): puts the
// week's movable jobs on days for the least driving, for one tech or everyone, with one Undo for
// the whole change. Owners and admins.

export const PLAN_WEEK_HELP =
  "Puts this week’s movable jobs on days for the least driving. Started, locked, two-tech and maintenance jobs stay where they are.";

/** The picker's closed label: "Everyone", "2 Techs" or the one tech's name. */
export function planWeekTechsLabel(
  picked: string[],
  techs: { id: string; name: string }[],
): string {
  if (picked.length === 0) return "None";
  if (techs.length > 1 && picked.length === techs.length) return "Everyone";
  if (picked.length === 1) return techs.find((t) => t.id === picked[0])?.name ?? "1 Tech";
  return `${picked.length} Techs`;
}

/**
 * The Plan Week button and its sheet. The result shows as a banner at the top of the screen,
 * with Undo (owner, 2026-10-20: results "on a banner on the top of the screen").
 */
export function PlanWeek({
  dates,
  techs,
  defaultTech,
  waiting = 0,
  className,
  buttonClassName,
}: {
  /** The week on screen. */
  dates: string[];
  techs: { id: string; name: string }[];
  /** The tech picked for the maps, else Everyone. */
  defaultTech: string | null;
  /** Jobs in Needs a Time with nobody on them (for the switch's detail). */
  waiting?: number;
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const fallback =
    defaultTech && techs.some((t) => t.id === defaultTech) ? [defaultTech] : techs.map((t) => t.id);
  // Who to plan for: one or more techs (owner, 2026-10-20: "select multiple techs when planning
  // a week. Then it should split the open jobs up evenly"); at least one.
  const [picked, setPicked] = useState<string[]>(fallback);
  const everyone = techs.length > 0 && picked.length === techs.length;
  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id)
        ? p.filter((x) => x !== id)
        : techs.map((t) => t.id).filter((x) => x === id || p.includes(x)),
    );
  const [withTray, setWithTray] = useState(true);
  const [pending, start] = useTransition();
  const close = useCallback(() => setOpen(false), []);
  const everyDayPast = dates.length === 0;

  function report(r: WeekPlanResult) {
    if (r.error) {
      showBanner({ tone: "error", message: r.error });
      return;
    }
    if (!r.message) return;
    const rows = r.undo;
    showBanner({
      message: r.message,
      // With several techs, how the jobs were split: "Ana 6 jobs · Ben 5 jobs".
      detail: r.detail,
      // One Undo puts the whole week back.
      action: rows?.length ? { label: "Undo", onAction: () => putBack(rows) } : undefined,
    });
  }

  function plan() {
    setOpen(false);
    start(async () => {
      const r = await planWeek({
        dates,
        techs: everyone ? "all" : picked,
        tray: waiting > 0 && withTray,
      });
      // With the refreshed week, not before it.
      start(() => report(r));
    });
  }

  function putBack(rows: WeekUndoRow[]) {
    start(async () => {
      const r = await undoPlanWeek(rows);
      if (r.error) showBanner({ tone: "error", message: r.error });
      else if (r.message) showBanner({ message: r.message });
    });
  }

  return (
    <div className={className}>
      <Button
        type="button"
        kind="secondary"
        aria-haspopup="dialog"
        disabled={pending || everyDayPast}
        aria-busy={pending || undefined}
        className={cx("gap-2", pending && "disabled:opacity-100", buttonClassName)}
        onClick={() => {
          // The sheet starts from the tech the maps show.
          setPicked(fallback);
          setWithTray(true);
          setOpen(true);
        }}
      >
        {pending ? (
          <span
            aria-hidden="true"
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none motion-reduce:border-r-current motion-reduce:opacity-60"
          />
        ) : null}
        {pending ? "Planning…" : "Plan Week"}
      </Button>
      <Sheet open={open} onClose={close} title="Plan Week">
        <div className="space-y-4 pt-1">
          {/* Who to plan for, as an iOS checklist with checkmarks: Everyone (all or none),
              then each tech. */}
          <div role="group" aria-labelledby="plan-for">
            <p
              id="plan-for"
              className="mb-1.5 flex justify-between gap-3 px-4 text-[0.9375rem] text-text-muted"
            >
              <span>Plan for</span>
              <span aria-hidden="true">{planWeekTechsLabel(picked, techs)}</span>
            </p>
            {techs.length > 1 ? (
              <ul className="grouped">
                <Check
                  label="Everyone"
                  checked={everyone}
                  onClick={() => setPicked(everyone ? [] : techs.map((t) => t.id))}
                />
              </ul>
            ) : null}
            <ul className={cx("grouped", techs.length > 1 && "mt-4")}>
              {techs.map((t) => (
                <Check
                  key={t.id}
                  label={t.name}
                  checked={picked.includes(t.id)}
                  onClick={() => toggle(t.id)}
                />
              ))}
            </ul>
          </div>
          {waiting > 0 ? (
            // Whether jobs nobody has yet come onto the week too (an iOS switch row).
            <ul className="grouped">
              <li>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block">Place Jobs from Needs a Time</span>
                    <span className="block text-[0.9375rem] text-text-muted">
                      {waiting} waiting
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    className="ios-switch"
                    checked={withTray}
                    onChange={(e) => setWithTray(e.target.checked)}
                  />
                </label>
              </li>
            </ul>
          ) : null}
          <p className="-mt-2 px-4 text-[0.9375rem] text-text-muted">{PLAN_WEEK_HELP}</p>
          <Button type="button" onClick={plan} disabled={!picked.length} className="w-full">
            Plan Week
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** A checklist row: the name, and a checkmark when it's chosen. */
function Check({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onClick}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-text/[0.03] active:bg-text/[0.06]"
      >
        <span>{label}</span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={cx("size-5 shrink-0 text-link", !checked && "invisible")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </button>
    </li>
  );
}
