import { CarFillIcon } from "./icons";
import { cx } from "./ui";

/**
 * The drive to a stop as a chip (docs/design/2026-10-21-schedule-tile.md; owner, 2026-10-21: "I
 * like the chip"): a small gray pill with a car and the minutes, "🚗 23". Screen readers say
 * "23 minute drive". Shared by Today's stops and the Schedule's tiles; the iPhone app's
 * DriveChip.swift and the Android app's ui/DriveChip.tsx draw the same.
 */
export function DriveChip({ minutes, className }: { minutes: number; className?: string }) {
  const min = Math.max(0, Math.round(minutes));
  return (
    <span
      role="img"
      aria-label={`${min} minute drive`}
      data-testid="drive-chip"
      className={cx(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full bg-fill px-1.5 py-px text-[0.75rem] leading-4 font-semibold text-text-muted tabular-nums",
        className,
      )}
    >
      <CarFillIcon className="size-3.5" />
      <span aria-hidden="true">{min}</span>
    </span>
  );
}
