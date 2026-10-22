import { useId } from "react";
import type { DayProgress } from "@leakbook/core";
import { DayRing } from "./day-ring";
import { TechDot } from "./tech-dot";
import { StatusBadge, cx } from "./ui";

/** One tech's row on the owner's Team (core techDayProgress, with the time already in words). */
export interface TeamRow {
  progress: DayProgress;
  /** "4 of 11 stops", "2 left · about 1 hr", "All 11 done"; before the first, "11 stops". */
  line: string;
  /** The stop they're on: started (In progress) or the next to do (Now). */
  current: { customer: string; started: boolean } | null;
  /** "Last done: Jones at 10:42 AM". */
  lastDone: string | null;
}

export interface TeamDay {
  id: string;
  label: string;
  color?: string | null;
  team?: TeamRow;
}

/**
 * The owner's Team on Today (owner, 2026-10-22: "The owner sees techs' progress live"; docs/
 * design/2026-10-22-owner-live-today.md): an inset grouped list, one row per tech with stops
 * today, in Whose Day's order. Each row: the day's ring, the tech's dot and name with the ring's
 * words, the stop they're on (Now, or In progress once started), and the last stop done with its
 * time. Choosing a row shows that tech's day, as Whose Day does. The page keeps it live
 * (LiveRefresh), so a stop done on a phone shows here within seconds.
 */
export function TeamToday({
  days,
  shown,
  onPick,
  className,
}: {
  days: TeamDay[];
  shown: string;
  onPick: (id: string) => void;
  className?: string;
}) {
  const title = useId();
  const rows = days.filter((d): d is TeamDay & { team: TeamRow } => !!d.team);
  return (
    <section aria-labelledby={title} className={className}>
      <h2 id={title} className="mb-2 px-4 text-[0.8125rem] text-text-muted uppercase">
        Team
      </h2>
      <ul className="grouped" data-testid="team-today">
        {rows.map((d) => {
          const t = d.team;
          const on = d.id === shown;
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onPick(d.id)}
                aria-current={on ? "true" : undefined}
                data-testid="team-row"
                className={cx(
                  "flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left",
                  "hover:bg-text/[0.03] active:bg-text/[0.06]",
                  on && "bg-primary/[0.06] hover:bg-primary/[0.08]",
                )}
              >
                <DayRing progress={t.progress} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <TechDot color={d.color} />
                    <span className="min-w-0 truncate font-semibold">{d.label}</span>
                    <span className="ml-auto shrink-0 pl-2 text-[0.9375rem] text-text-muted tabular-nums">
                      {t.progress.text ? (
                        <>
                          <span className="sr-only">{t.progress.spoken}</span>
                          <span aria-hidden="true">{t.line}</span>
                        </>
                      ) : (
                        t.line
                      )}
                    </span>
                  </span>
                  {t.current ? (
                    <span className="mt-1 flex min-w-0 items-center gap-2 text-[0.9375rem]">
                      {t.current.started ? (
                        <StatusBadge status="in_progress" />
                      ) : (
                        <span className="shrink-0 rounded-full bg-water px-2.5 py-0.5 text-[0.8125rem] font-semibold text-white">
                          Now
                        </span>
                      )}
                      <span className="min-w-0 truncate">{t.current.customer}</span>
                    </span>
                  ) : null}
                  {t.lastDone ? (
                    <span className="mt-0.5 block truncate text-[0.8125rem] text-text-muted">
                      {t.lastDone}
                    </span>
                  ) : null}
                </span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-xl leading-none text-text-muted/70 lg:hidden"
                >
                  ›
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
