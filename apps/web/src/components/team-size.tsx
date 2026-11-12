"use client";

import { useEffect, useState } from "react";
import { cx } from "./ui";

/**
 * The team size once the owner stops tapping: Stripe's card form is started for a price, so it
 * starts again only for the size they settle on, not for every tap.
 */
export function useSettledTeamSize(value: number, ms = 600): number {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

const BUTTON =
  "grid size-11 place-items-center rounded-full bg-thumb text-xl font-semibold shadow-[0_2px_6px_rgb(0_0_0/0.1)] disabled:opacity-40";

/**
 * People on the team, with − and + (an iOS stepper with its value between): the website's
 * pricing, the trial page, and Sundeck Pro Billing (owner, 2026-11-12: "you can't adjust how
 * many employees you have and the pricing"). Label it with `labelledBy`.
 */
export function TeamSizeStepper({
  value,
  min,
  max,
  onChange,
  labelledBy,
  size = "large",
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  labelledBy: string;
  /** Large: the number in display type (pricing). Compact: beside a label in a row. */
  size?: "large" | "compact";
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-1 rounded-full bg-fill p-1"
      role="group"
      aria-labelledby={labelledBy}
    >
      <button
        type="button"
        aria-label="Fewer people"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={BUTTON}
      >
        −
      </button>
      <output
        aria-live="polite"
        className={cx(
          "text-center tabular-nums",
          size === "large"
            ? "w-24 font-display text-2xl font-extrabold"
            : "w-9 text-[1.0625rem] font-semibold",
        )}
        data-testid="team-size"
      >
        {value}
      </output>
      <button
        type="button"
        aria-label="More people"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={BUTTON}
      >
        +
      </button>
    </div>
  );
}
