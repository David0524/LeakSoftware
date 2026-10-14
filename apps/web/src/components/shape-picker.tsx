"use client";

import { useId, type KeyboardEvent } from "react";
import { DIAGRAM_SHAPES, poolDiagram, type DiagramShape } from "@leakbook/core";
import { cx } from "./ui";

/**
 * The pool's shape as five small drawings to tap (owner, 2026-10-14: a menu of shape names
 * was easy to miss). Posts as `name` when given (empty when none is picked). The shape can
 * stay blank; tapping the picked shape again clears it. One Tab stop; arrow keys move it.
 */
export function ShapePicker({
  value,
  onChange,
  name,
  label = "Pool shape",
  disabled = false,
  hint,
}: {
  value: DiagramShape | null;
  onChange: (shape: DiagramShape | null) => void;
  name?: string;
  label?: string;
  disabled?: boolean;
  /** A line under the label, e.g. that it can be set later. */
  hint?: string;
}) {
  const id = useId();
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = Math.max(
      DIAGRAM_SHAPES.findIndex((s) => s.key === value),
      step > 0 ? -1 : 0,
    );
    const next = (i + step + DIAGRAM_SHAPES.length) % DIAGRAM_SHAPES.length;
    onChange(DIAGRAM_SHAPES[next]!.key);
    e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  }
  return (
    <div className="space-y-1">
      <p className="font-medium" id={id}>
        {label}
      </p>
      {hint ? <p className="text-[0.9375rem] text-text-muted">{hint}</p> : null}
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="grid max-w-md grid-cols-5 gap-2"
        onKeyDown={onKeyDown}
      >
        {DIAGRAM_SHAPES.map((s) => {
          const d = poolDiagram(s.key, false);
          const on = value === s.key;
          // With nothing picked, the first shape takes the Tab stop.
          const tabStop = on || (value === null && s.key === DIAGRAM_SHAPES[0]!.key);
          return (
            <button
              key={s.key}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={tabStop ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(on ? null : s.key)}
              className={cx(
                "flex min-h-11 min-w-0 flex-col items-center gap-1 rounded-2xl border-2 px-0.5 pt-1.5 pb-1 text-[0.75rem] leading-tight font-semibold tracking-tight whitespace-nowrap",
                "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60",
                on
                  ? "border-link bg-link/10 text-link"
                  : "border-transparent bg-text/[0.05] text-text",
              )}
            >
              <svg viewBox={`0 0 ${d.width} ${d.height}`} className="w-full" aria-hidden="true">
                <path d={d.pool} className="fill-diagram-water stroke-water" strokeWidth={5} />
              </svg>
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
