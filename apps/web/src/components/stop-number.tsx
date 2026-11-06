import { cx } from "./ui";

/**
 * A stop's place in the route on Today and the Schedule (owner, 2026-11-06: out of the bubble,
 * option B of five: "Big and black, like a Calendar day"): the number alone in Barlow ExtraBold,
 * blue while the stop is being worked, a green check once it's done. About the 32 pt the old
 * circle took, so the tiles' hairlines still start after it.
 */
export function StopNumber({
  position,
  done,
  current,
  small = false,
}: {
  position: number;
  done: boolean;
  /** Being worked now (in progress, or Today's next stop). */
  current: boolean;
  /** A week cell's tighter tile. */
  small?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid shrink-0 place-items-center font-display leading-none font-extrabold tabular-nums",
        small ? "w-6 text-[1.25rem]" : "w-8 text-[1.625rem]",
        done ? "text-status-pass" : current ? "text-link" : "text-text",
      )}
    >
      {done ? (
        <svg
          viewBox="0 0 24 24"
          className={small ? "size-[1.125rem]" : "size-6"}
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
  );
}
