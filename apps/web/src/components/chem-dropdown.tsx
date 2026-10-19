"use client";

import { useId, useState } from "react";
import { ChemCalculator, type ChemicalPool } from "./chem-calculator";
import { cx } from "./ui";

/**
 * Chemical on a visit's Checklist, opened in place (owner, 2026-10-19: "There is no way back to
 * the job from the chemical page. I think it should be a dropdown rather than its own page").
 * Closed, one line: the pool's last readings, or a prompt. Open: the calculator with What to
 * Add under the readings, and Submit to the pool's log.
 */
export function ChemicalDropdown({
  pool,
  initialGallons,
  last,
}: {
  pool: ChemicalPool;
  initialGallons: number | null;
  /** "Last: FC 3 · pH 7.6 · Mon 8:15 AM", or null when nothing was submitted yet. */
  last: string | null;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <section aria-label="Chemical" className="card mb-6 max-w-2xl">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen(!open)}
          className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-sans text-[1.0625rem] font-semibold">Chemical</span>
            <span className="block truncate text-[0.9375rem] text-text-muted tabular-nums">
              {last ?? "Add today’s readings"}
            </span>
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
      </h2>
      {open ? (
        <div id={panel} className="border-t-[0.5px] border-separator px-4 pt-4 pb-5">
          <ChemCalculator initialGallons={initialGallons} pool={pool} inline />
        </div>
      ) : null}
    </section>
  );
}
