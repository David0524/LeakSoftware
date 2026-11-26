"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { SECOND_BUSINESS_TEXT, type Business } from "@leakbook/core";
import { setJobBusiness } from "@/app/actions/jobs";
import { ContextMenu, bannerFor } from "./row-actions";

/**
 * The job page's Business row (2026-11-26): the job's business name, a pop-up menu with both
 * names and a check on the current one. Saves at once.
 */
export function BusinessPopUp({
  jobId,
  current,
  choices,
}: {
  jobId: string;
  current: Business;
  choices: { value: Business; label: string }[];
}) {
  const [shown, setShown] = useOptimistic(current);
  const [, start] = useTransition();
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const label = choices.find((c) => c.value === shown)?.label ?? "";
  function pick(next: Business) {
    if (next === shown) return;
    start(async () => {
      setShown(next);
      const r = await setJobBusiness({ jobId, business: next });
      if (r.error) bannerFor(r, "");
    });
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`${SECOND_BUSINESS_TEXT.jobRow}, ${label}`}
        aria-haspopup="menu"
        aria-expanded={at != null}
        data-testid="business-popup"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.left, y: r.bottom + 4 });
        }}
        className="-my-1.5 inline-flex min-h-11 min-w-0 items-center justify-end gap-1 rounded-lg text-right text-link focus-visible:outline-3 focus-visible:outline-focus"
      >
        <span className="min-w-0 break-words">{label}</span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-3.5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 9.5l5-5 5 5M7 14.5l5 5 5-5" />
        </svg>
      </button>
      {at ? (
        <ContextMenu
          title={SECOND_BUSINESS_TEXT.jobRow}
          entries={choices.map((c) => ({
            label: c.label,
            checked: c.value === shown,
            onSelect: () => pick(c.value),
          }))}
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

/**
 * New Job's and New Quote's Business row (2026-11-26): starts on the automatic choice (`auto`,
 * which follows the job type until the person picks) and posts `business` only once picked, so an
 * untouched job stays automatic.
 */
export function BusinessField({
  auto,
  choices,
}: {
  auto: Business;
  choices: { value: Business; label: string }[];
}) {
  const [picked, setPicked] = useState<Business | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const shown = picked ?? auto;
  const label = choices.find((c) => c.value === shown)?.label ?? "";
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span className="shrink-0">{SECOND_BUSINESS_TEXT.jobRow}</span>
      <button
        ref={button}
        type="button"
        aria-label={`${SECOND_BUSINESS_TEXT.jobRow}, ${label}`}
        aria-haspopup="menu"
        aria-expanded={at != null}
        data-testid="business-field"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.left, y: r.bottom + 4 });
        }}
        className="-my-1.5 inline-flex min-h-11 min-w-0 items-center justify-end gap-1 rounded-lg text-right text-link focus-visible:outline-3 focus-visible:outline-focus"
      >
        <span className="min-w-0 break-words">{label}</span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-3.5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 9.5l5-5 5 5M7 14.5l5 5 5-5" />
        </svg>
      </button>
      {picked ? <input type="hidden" name="business" value={picked} /> : null}
      {at ? (
        <ContextMenu
          title={SECOND_BUSINESS_TEXT.jobRow}
          entries={choices.map((c) => ({
            label: c.label,
            checked: c.value === shown,
            onSelect: () => setPicked(c.value),
          }))}
          at={at}
          onClose={(refocus) => {
            setAt(null);
            if (refocus) button.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
