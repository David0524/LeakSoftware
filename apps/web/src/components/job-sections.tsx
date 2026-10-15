"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { cx } from "./ui";

export interface JobSection {
  id: string;
  label: string;
  /** Shown as a small count after the label, e.g. checklist items still to do. */
  badge?: number;
  content: ReactNode;
}

/**
 * The job page in parts. Phones get a segmented switcher pinned under the navigation bar,
 * one part at a time (the page was 15 screens long); wider screens keep one page.
 * The part shown is kept in the URL (#checklist) so a reload or a shared link returns to it.
 */
export function JobSections({ sections }: { sections: JobSection[] }) {
  const hash = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("hashchange", onChange);
      return () => window.removeEventListener("hashchange", onChange);
    },
    () => window.location.hash.slice(1),
    () => "",
  );
  const active = sections.some((s) => s.id === hash) ? hash : sections[0]!.id;

  function choose(id: string) {
    // replaceState keeps Back for leaving the job; tell the store the hash changed.
    history.replaceState(null, "", `#${id}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    window.scrollTo({ top: 0 });
  }

  return (
    <>
      {/* As in iOS: the segmented control sits on the page, and once scrolled it stays under
          the navigation bar on the same frosted bar, one hairline below both (no floating
          card). */}
      <div className="nav-accessory glass-bar sticky top-[calc(2.75rem+env(safe-area-inset-top))] z-20 -mx-4 mb-4 px-4 py-2 sm:hidden">
        <div
          role="tablist"
          aria-label="Job sections"
          className="grid grid-cols-5 gap-0.5 rounded-full bg-fill p-0.5"
        >
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`tab-${s.id}`}
              aria-selected={active === s.id}
              aria-controls={`part-${s.id}`}
              onClick={() => choose(s.id)}
              // The iOS segmented control: the chosen part on a raised white thumb.
              className={cx(
                "relative min-h-11 rounded-full px-1 text-[0.8125rem] transition-colors",
                active === s.id
                  ? "bg-thumb font-semibold text-text shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)]"
                  : "font-medium text-text",
              )}
            >
              {s.label}
              {s.badge ? (
                <span
                  className={cx(
                    "absolute -top-1 right-0 min-w-5 rounded-full px-1 text-[0.6875rem] leading-5",
                    "bg-status-warning text-on-status",
                  )}
                  aria-label={`, ${s.badge} to do`}
                >
                  {s.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
      {sections.map((s, i) => (
        <div
          key={s.id}
          id={`part-${s.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${s.id}`}
          className={cx(i > 0 && "sm:mt-10", active !== s.id && "max-sm:hidden")}
        >
          {s.content}
        </div>
      ))}
    </>
  );
}
