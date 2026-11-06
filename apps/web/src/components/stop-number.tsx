import { cx } from "./ui";

/**
 * A stop's place in the route on Today and the Schedule (owner, 2026-11-06: "Take the stop
 * numbers out of the bubble … Just the number and a thin line"): the number alone in Barlow
 * ExtraBold, then a hairline down the tile, like a date column. A green check once the stop is
 * done, the number in blue while it's being worked. The same 32 pt as the old circle, so the
 * tiles' hairlines still start after it.
 */
export function StopNumber({
  position,
  done,
  current,
  small = false,
  stretch = true,
}: {
  position: number;
  done: boolean;
  /** Being worked now (in progress, or Today's next stop). */
  current: boolean;
  /** A week cell's tighter tile. */
  small?: boolean;
  /** The line runs the tile's height (Schedule); off, it's as tall as the number (Today). */
  stretch?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "flex shrink-0 items-center",
        stretch && "self-stretch",
        small ? "gap-1.5" : "gap-2",
      )}
    >
      <span
        className={cx(
          "grid place-items-center font-display font-extrabold tabular-nums leading-none",
          small ? "w-5 text-[1.0625rem]" : "w-[1.4375rem] text-[1.375rem]",
          done ? "text-status-pass" : current ? "text-link" : "text-text",
        )}
      >
        {done ? (
          <svg
            viewBox="0 0 24 24"
            className={small ? "size-4" : "size-5"}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : (
          position
        )}
      </span>
      <span className={cx("w-px bg-separator", stretch ? "self-stretch" : "h-7")} />
    </span>
  );
}
