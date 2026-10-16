"use client";

import type { KeyboardEvent } from "react";
import { SEGMENT_TRACK, segmentClass } from "./ui";

/** Two to five related choices, as a segmented control (house rule). Posts as `name`. */
export function Segmented<T extends string>({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  // One Tab stop for the group; arrow keys move the choice (design review L4).
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + step + options.length) % options.length]!;
    onChange(next.value);
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]");
    buttons[options.indexOf(next)]?.focus();
  }
  return (
    <div className="space-y-1">
      <p className="font-medium" id={`${name}-label`}>
        {label}
      </p>
      <input type="hidden" name={name} value={value} />
      <div
        role="radiogroup"
        aria-labelledby={`${name}-label`}
        className={SEGMENT_TRACK}
        onKeyDown={onKeyDown}
      >
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            // Nothing chosen yet: the first segment takes the Tab stop.
            tabIndex={
              value === o.value || (i === 0 && !options.some((x) => x.value === value)) ? 0 : -1
            }
            onClick={() => onChange(o.value)}
            className={segmentClass(value === o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
