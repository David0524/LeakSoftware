import type { DayProgress } from "@leakbook/core";
import { cx } from "./ui";

/**
 * The day's progress ring on Today's summary line (owner, 2026-10-22, goal-gradient; docs/
 * design/2026-10-22-progress-cues.md): a 28 pt ring in the primary blue on a gray track; with
 * every stop done, a filled green circle with a check. The words beside it carry the count, so
 * the ring itself is hidden from screen readers.
 */
export function DayRing({ progress, className }: { progress: DayProgress; className?: string }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  const done = progress.state === "all_done";
  return (
    <svg
      viewBox="0 0 28 28"
      aria-hidden="true"
      data-testid="day-ring"
      data-state={progress.state}
      className={cx("size-7 shrink-0", className)}
    >
      {done ? (
        <>
          <circle cx="14" cy="14" r="13" fill="var(--color-status-pass)" />
          <path
            d="M8.5 14.5l3.6 3.6 7.4-8"
            fill="none"
            stroke="#fff"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <circle cx="14" cy="14" r={r} fill="none" stroke="var(--lb-fill)" strokeWidth="4" />
          <circle
            cx="14"
            cy="14"
            r={r}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="4"
            // No round cap at 0 (it drew a dot at the top of an empty track), as the apps.
            strokeOpacity={progress.fraction > 0 ? 1 : 0}
            strokeLinecap="round"
            strokeDasharray={`${c * progress.fraction} ${c}`}
            transform="rotate(-90 14 14)"
            className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-500"
          />
        </>
      )}
    </svg>
  );
}
