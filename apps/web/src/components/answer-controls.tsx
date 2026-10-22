"use client";

import { useId, useRef, useState } from "react";
import { CHOOSE_HINT, CHOOSE_LABEL, type AnswerIcon, type AnswerTone } from "@leakbook/core";
import { ContextMenu, type MenuEntry } from "./row-actions";
import { cx } from "./ui";

// A checklist item's answers on its one line on phones (owner, 2026-10-22: "I actually like your
// icons"; docs/design/2026-10-22-phone-checklist.md): one icon button per answer, one tap each,
// the chosen one filled in its status color; or, where the answers have no clear icons, one pill
// that opens a menu. The same glyphs as the iPhone's SF Symbols and Android's.

const FILL: Record<AnswerTone, string> = {
  pass: "bg-status-pass text-on-status",
  fail: "bg-status-fail text-on-status",
  warning: "bg-status-warning text-on-status",
  excluded: "bg-status-excluded text-on-status",
  plain: "bg-primary text-white",
};

const TINT: Record<AnswerTone, string> = {
  pass: "bg-status-pass/12 text-status-pass",
  fail: "bg-status-fail/12 text-status-fail",
  warning: "bg-status-warning/12 text-status-warning",
  excluded: "bg-status-excluded/12 text-status-excluded",
  plain: "bg-link/12 text-link",
};

/** The glyph for an answer, on a 24 x 24 artboard. */
export function AnswerGlyph({
  symbol,
  className,
}: {
  symbol: AnswerIcon["symbol"];
  className?: string;
}) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cx("size-4", className)}>
      {symbol === "check" ? <path d="M5 12.5l4.5 4.5L19 7.5" {...stroke} /> : null}
      {symbol === "xmark" ? <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...stroke} /> : null}
      {symbol === "drop" ? (
        <path d="M12 3.5S6 10.2 6 14.5a6 6 0 0 0 12 0C18 10.2 12 3.5 12 3.5z" fill="currentColor" />
      ) : null}
      {symbol === "exclamation" ? (
        <path d="M12 5v9.5M12 19v.01" {...stroke} strokeWidth={3} />
      ) : null}
      {symbol === "minus" ? <path d="M6 12h12" {...stroke} /> : null}
      {symbol === "skip" ? (
        <>
          <path d="M6 6.5l8 5.5-8 5.5z" fill="currentColor" />
          <path d="M17.5 6.5v11" {...stroke} />
        </>
      ) : null}
    </svg>
  );
}

export interface AnswerIconChoice {
  label: string;
  icon: AnswerIcon;
  chosen: boolean;
  onSelect: () => void;
}

/**
 * The answers as icon pills, 40 x 36 inside 44 x 44 targets that touch but don't overlap. Each
 * is labeled with its answer's word (never the glyph's name), and shows it on hover.
 */
export function AnswerIconButtons({
  itemLabel,
  choices,
  className,
}: {
  itemLabel: string;
  choices: AnswerIconChoice[];
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={itemLabel}
      data-no-swipe=""
      className={cx("flex shrink-0", className)}
    >
      {choices.map((c) => (
        <button
          key={c.label}
          type="button"
          aria-label={c.label}
          aria-pressed={c.chosen}
          title={c.label}
          onClick={c.onSelect}
          className="group/answer grid size-11 place-items-center focus-visible:outline-none"
        >
          <span
            className={cx(
              "grid h-9 w-10 place-items-center rounded-full transition-colors motion-reduce:transition-none",
              "group-focus-visible/answer:outline-3 group-focus-visible/answer:outline-focus",
              c.chosen
                ? FILL[c.icon.tone]
                : "bg-fill text-text-muted group-hover/answer:bg-text/[0.1]",
            )}
          >
            <AnswerGlyph symbol={c.icon.symbol} />
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * The fallback: the answer as a tinted pill with a chevron ("Choose" in the link blue while
 * unanswered) that opens a menu of the options, with Not Done once answered.
 */
export function AnswerMenuPill({
  itemLabel,
  options,
  chosen,
  onChoose,
  className,
}: {
  itemLabel: string;
  options: { label: string; tone: AnswerTone }[];
  chosen: string | null;
  onChoose: (label: string | null) => void;
  className?: string;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const hint = useId();
  const tone = options.find((o) => o.label === chosen)?.tone;
  const entries: MenuEntry[] = [
    ...options.map((o) => ({
      label: o.label,
      checked: o.label === chosen,
      onSelect: () => onChoose(o.label),
    })),
    chosen != null && "separator",
    chosen != null && { label: "Not Done", onSelect: () => onChoose(null) },
  ];
  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={at != null}
        aria-label={`${itemLabel}, ${chosen ?? "To Do"}`}
        aria-describedby={hint}
        title={CHOOSE_HINT}
        ref={button}
        data-no-swipe=""
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.right, y: r.bottom + 4 });
        }}
        className={cx("flex min-h-11 shrink-0 items-center", className)}
      >
        <span
          className={cx(
            "inline-flex max-w-40 items-center gap-1 rounded-full px-3 py-1.5 text-[0.9375rem] leading-tight font-semibold",
            tone ? TINT[tone] : "bg-fill text-link",
          )}
        >
          <span className="line-clamp-2 text-right">{chosen ?? CHOOSE_LABEL}</span>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
        <span id={hint} hidden>
          {CHOOSE_HINT}
        </span>
      </button>
      {at ? (
        <ContextMenu
          title={itemLabel}
          entries={entries}
          at={at}
          onClose={(refocus) => {
            setAt(null);
            if (refocus) button.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

/** The flags' tones, for a pool inspection question's options in the menu pill. */
export function flagTone(flag: "ok" | "attention" | "leaking" | "na" | undefined): AnswerTone {
  return flag === "ok"
    ? "pass"
    : flag === "leaking"
      ? "fail"
      : flag === "attention"
        ? "warning"
        : flag === "na"
          ? "excluded"
          : "plain";
}
