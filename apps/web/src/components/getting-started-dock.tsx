"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { hideGettingStarted } from "@/app/actions/getting-started";
import { cx } from "./ui";

export interface Step {
  id: string;
  label: string;
  detail: string;
  href: string;
  done: boolean;
}

const OPEN_KEY = "lb_getting_started_open";
const OPEN_EVENT = "lb-getting-started";
// Where the choice lives when storage is blocked (private mode): this page only.
let openHere = false;

function subscribe(fn: () => void) {
  addEventListener(OPEN_EVENT, fn);
  addEventListener("storage", fn);
  return () => {
    removeEventListener(OPEN_EVENT, fn);
    removeEventListener("storage", fn);
  };
}

function isOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return openHere;
  }
}

function setOpen(next: boolean) {
  openHere = next;
  try {
    localStorage.setItem(OPEN_KEY, next ? "1" : "0");
  } catch {
    // Storage blocked: openHere keeps it.
  }
  dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Wider screens: Getting Started as a small panel in the bottom corner, after Stripe's setup
 * guide (owner, 2026-10-18: the card "pushes lots of our information out of the way"). It
 * starts as a button with the progress; opened, it lists the steps over the page's corner.
 */
export function GettingStartedDock({ steps }: { steps: Step[] }) {
  // Opened or closed stays that way from page to page (this browser only).
  const open = useSyncExternalStore(subscribe, isOpen, () => false);
  useEffect(() => {
    if (!open) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);

  const done = steps.filter((s) => s.done).length;
  const progress = (bar: boolean) => (
    <div
      role={bar ? "progressbar" : undefined}
      aria-label={bar ? "Getting Started progress" : undefined}
      aria-valuemin={bar ? 0 : undefined}
      aria-valuemax={bar ? steps.length : undefined}
      aria-valuenow={bar ? done : undefined}
      aria-hidden={bar ? undefined : true}
      className="h-1.5 overflow-hidden rounded-full bg-fill"
    >
      <div
        className="h-1.5 rounded-full bg-status-pass"
        style={{ width: `${(done / steps.length) * 100}%` }}
      />
    </div>
  );

  return (
    <div className="fixed right-6 bottom-6 z-30 max-sm:hidden">
      {open ? (
        <section
          id="getting-started-panel"
          aria-labelledby="getting-started-dock"
          data-testid="getting-started-dock"
          className="card w-80 overflow-hidden shadow-xl ring-1 ring-black/5"
        >
          <div className="flex items-center gap-1 px-4 pt-3">
            <h2 id="getting-started-dock" className="flex-1 font-sans font-semibold">
              Getting Started
            </h2>
            <form action={hideGettingStarted}>
              <button
                type="submit"
                className="min-h-11 px-2 text-[0.9375rem] font-medium text-link"
              >
                Hide
              </button>
            </form>
            <button
              type="button"
              aria-label="Minimize"
              title="Minimize"
              aria-expanded
              aria-controls="getting-started-panel"
              onClick={() => setOpen(false)}
              className="-mr-2 grid size-11 place-items-center rounded-full text-text-muted hover:text-text"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
          <div className="px-4 pb-2">
            <p className="mb-2 text-[0.8125rem] text-text-muted">
              {done} of {steps.length} done
            </p>
            {progress(true)}
          </div>
          <ul className="max-h-[min(24rem,calc(100vh-12rem))] overflow-y-auto pb-1">
            {steps.map((s) => (
              <li key={s.id}>
                <Link
                  href={s.href}
                  className="flex min-h-11 items-center gap-3 px-4 py-1.5 text-[0.9375rem] hover:bg-text/[0.04]"
                >
                  <span
                    aria-hidden="true"
                    className={
                      s.done
                        ? "inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-status-pass text-[0.6875rem] text-white"
                        : "size-5 shrink-0 rounded-full border-2 border-control-border"
                    }
                  >
                    {s.done ? "✓" : null}
                  </span>
                  <span className={cx("min-w-0 flex-1", s.done && "text-text-muted line-through")}>
                    {s.label}
                    <span className="sr-only">{s.done ? " (done)" : ""}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <button
          type="button"
          aria-expanded={false}
          aria-label={`Getting Started, ${done} of ${steps.length} done`}
          onClick={() => setOpen(true)}
          className="card flex w-64 flex-col gap-2 px-4 py-3 text-left shadow-xl ring-1 ring-black/5"
        >
          <span className="flex w-full items-center justify-between gap-2">
            <span className="font-semibold">Getting Started</span>
            <span className="text-[0.8125rem] text-text-muted">
              {done} of {steps.length}
            </span>
          </span>
          <span className="block w-full">{progress(false)}</span>
        </button>
      )}
    </div>
  );
}
