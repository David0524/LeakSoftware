"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { SEGMENT_TRACK, cx, segmentClass } from "./ui";

/** SEGMENT_TRACK as one full-width row. */
const FIT_TRACK = "flex w-full gap-0.5 rounded-[1.5rem] bg-fill p-0.5";

/** Two to five related choices, as a segmented control (house rule). Posts as `name`. */
export function Segmented<T extends string>({
  label,
  name,
  value,
  options,
  onChange,
  fit = false,
  description,
  segmentClassName,
}: {
  label: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  /**
   * One row across the full width, each segment as wide as its label needs, for four longer
   * labels on a phone (iOS never wraps a segmented control onto two rows).
   */
  fit?: boolean;
  /** A line under the label, e.g. a checklist item's method and notes. */
  description?: ReactNode;
  /** Extra classes for each segment, e.g. min-h-11 for 44 pt answers. */
  segmentClassName?: string;
}) {
  // Unique per control: a page can hold several with the same field name (Team's role).
  const labelId = `${name}-label-${useId()}`;
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
  // Hold the chosen segment and drag it along the track, as iOS 26's segmented controls do
  // (owner, 2026-10-19: "hold the slider/selector like a bubble and drag it around"): the
  // choice follows the finger and the segment lifts while held.
  const [held, setHeld] = useState(false);
  const dragging = useRef(false);
  function segmentAt(e: PointerEvent<HTMLDivElement>): T | null {
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")];
    const i = buttons.findIndex((b) => {
      const r = b.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right;
    });
    return i >= 0 ? options[i]!.value : null;
  }
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (segmentAt(e) !== value) return;
    dragging.current = true;
    setHeld(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    const next = segmentAt(e);
    if (next !== null && next !== value) onChange(next);
  }
  function onPointerEnd() {
    dragging.current = false;
    setHeld(false);
  }
  return (
    <div className="space-y-1">
      <p className="font-medium" id={labelId}>
        {label}
      </p>
      {description ? (
        <p id={`${labelId}-note`} className="truncate text-[0.8125rem] text-text-muted">
          {description}
        </p>
      ) : null}
      <input type="hidden" name={name} value={value} />
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={description ? `${labelId}-note` : undefined}
        // Dragging the thumb sideways never swipes to the next job section.
        data-no-swipe
        className={cx(fit ? FIT_TRACK : SEGMENT_TRACK, "touch-pan-y select-none")}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
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
            className={segmentClass(
              value === o.value,
              cx(
                fit
                  ? "min-w-0 flex-auto px-1.5 text-[0.8125rem] sm:px-4 sm:text-[0.9375rem]"
                  : undefined,
                "transition-transform duration-200 motion-reduce:transition-none",
                held && value === o.value && "scale-[1.06] shadow-lg",
                segmentClassName,
              ),
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
