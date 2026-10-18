"use client";

import { useState } from "react";
import { REPEAT_OPTIONS, type RepeatChoice } from "@/lib/plan-repeat";
import { Segmented } from "./segmented";
import { FieldError } from "./settings-forms";
import { Select, cx } from "./ui";

const DAYS = [
  { value: 1, short: "M", name: "Monday" },
  { value: 2, short: "T", name: "Tuesday" },
  { value: 3, short: "W", name: "Wednesday" },
  { value: 4, short: "T", name: "Thursday" },
  { value: 5, short: "F", name: "Friday" },
  { value: 6, short: "S", name: "Saturday" },
  { value: 0, short: "S", name: "Sunday" },
];

/**
 * How often a plan repeats: a segmented control, and for Several Days, the days as a row of
 * round toggles (as in iOS Reminders' custom repeat). Posts `repeat` and `weekdays`. With
 * `once` (New Job), a menu with Just once first, posting "0".
 */
export function PlanRepeat({
  initial = "weekly",
  initialDays = [],
  once = false,
  onChange,
}: {
  initial?: RepeatChoice | "0";
  initialDays?: number[];
  once?: boolean;
  onChange?: (v: RepeatChoice | "0") => void;
}) {
  const [repeat, setRepeat] = useState<RepeatChoice | "0">(initial);
  const [days, setDays] = useState<number[]>(initialDays);
  const choose = (v: RepeatChoice | "0") => {
    setRepeat(v);
    onChange?.(v);
  };
  return (
    <div className="space-y-3">
      {once ? (
        // Five choices don't fit a phone's row, so New Job uses a menu.
        <Select
          label="Repeats"
          name="repeat"
          value={repeat}
          onChange={(e) => choose(e.target.value as RepeatChoice | "0")}
          options={[{ value: "0", label: "Just once" }, ...REPEAT_OPTIONS]}
          className="max-w-xs"
        />
      ) : (
        <Segmented
          label="Repeats"
          name="repeat"
          value={repeat}
          onChange={choose}
          fit
          options={REPEAT_OPTIONS}
        />
      )}
      {repeat === "days" ? (
        <fieldset>
          <legend className="mb-1 font-medium">Days</legend>
          {/* Seven across, sharing the row (a narrow card makes them a little narrower). */}
          <div className="flex gap-1">
            {DAYS.map((d) => {
              const on = days.includes(d.value);
              return (
                <label
                  key={d.value}
                  className={cx(
                    "flex h-11 max-w-11 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-full font-semibold select-none has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus",
                    on ? "bg-primary text-white" : "bg-text/[0.06] text-text",
                  )}
                >
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={d.value}
                    checked={on}
                    onChange={() =>
                      setDays(on ? days.filter((x) => x !== d.value) : [...days, d.value])
                    }
                    aria-label={d.name}
                    className="sr-only"
                  />
                  <span aria-hidden>{d.short}</span>
                </label>
              );
            })}
          </div>
          <FieldError name="weekdays" />
        </fieldset>
      ) : null}
    </div>
  );
}
