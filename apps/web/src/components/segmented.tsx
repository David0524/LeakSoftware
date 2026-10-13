"use client";

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
  return (
    <div className="space-y-1">
      <p className="font-medium" id={`${name}-label`}>
        {label}
      </p>
      <input type="hidden" name={name} value={value} />
      <div role="radiogroup" aria-labelledby={`${name}-label`} className={SEGMENT_TRACK}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
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
