"use client";

import { cx } from "./ui";

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
  return (
    <div className="space-y-1">
      <p className="font-medium" id={`${name}-label`}>
        {label}
      </p>
      <input type="hidden" name={name} value={value} />
      <div
        role="radiogroup"
        aria-labelledby={`${name}-label`}
        className="inline-flex max-w-full flex-wrap rounded-md border border-control-border bg-surface p-0.5"
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              "min-h-11 rounded px-4 font-medium",
              value === o.value ? "bg-text text-surface" : "text-text hover:bg-bg",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
