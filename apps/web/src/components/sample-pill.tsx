import { SAMPLE_PILL } from "@leakbook/core";
import { cx } from "./ui";

/**
 * The sample job's pill (owner, 2026-10-22: "clearly marked 'Sample' everywhere it shows"): on
 * its tile on Today and the Schedule, its row in Jobs, and its page.
 */
export function SamplePill({ className }: { className?: string }) {
  return (
    <span
      data-testid="sample-pill"
      className={cx(
        "inline-block rounded-full bg-status-warning px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap text-on-status",
        className,
      )}
    >
      {SAMPLE_PILL}
    </span>
  );
}
