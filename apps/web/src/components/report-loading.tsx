"use client";

import { useEffect, useState } from "react";
import { cx } from "./ui";

const STEPS = [
  "Gathering the findings",
  "Adding the test results",
  "Placing the photos",
  "Drawing the pool diagram",
  "Putting it together",
];

/**
 * While a report loads (owner, 2026-10-20: "It is a long white screen when loading. We need to
 * keep users engaged during that loading time"): the report's outline taking shape, with the
 * steps checking off one by one. The steps are paced, not measured; the last one waits for the
 * page. Reduced motion keeps the list and drops the shimmer.
 */
export function ReportLoading({ title = "Getting your report ready" }: { title?: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 700);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="mx-auto w-full max-w-xl px-4 py-10 sm:py-16"
    >
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sundeck-mark.svg" alt="" className="size-10" />
        <h1 className="font-display text-[1.375rem] font-bold">{title}</h1>
      </div>
      <ol className="mt-6 space-y-3">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={cx(
              "flex items-center gap-3 text-[1.0625rem] transition-opacity duration-300 motion-reduce:transition-none",
              i > step && "opacity-40",
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                "grid size-6 shrink-0 place-items-center rounded-full",
                i < step ? "bg-status-pass text-on-status" : "border-2 border-control-border",
                i === step && "animate-pulse border-link motion-reduce:animate-none",
              )}
            >
              {i < step ? (
                <svg
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              ) : null}
            </span>
            <span className={cx(i === step && "font-semibold")}>
              {label}
              {i === step ? "…" : ""}
            </span>
          </li>
        ))}
      </ol>
      {/* The report's outline, shimmering into place. */}
      <div aria-hidden="true" className="card mt-8 space-y-3 p-5">
        <div className="h-5 w-2/3 animate-pulse rounded bg-fill motion-reduce:animate-none" />
        <div className="h-3 w-full animate-pulse rounded bg-fill motion-reduce:animate-none" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-fill motion-reduce:animate-none" />
        <div className="mt-4 h-32 animate-pulse rounded-lg bg-fill motion-reduce:animate-none" />
        <div className="grid grid-cols-3 gap-2">
          <div className="aspect-square animate-pulse rounded bg-fill motion-reduce:animate-none" />
          <div className="aspect-square animate-pulse rounded bg-fill motion-reduce:animate-none" />
          <div className="aspect-square animate-pulse rounded bg-fill motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}
