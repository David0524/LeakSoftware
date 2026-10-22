"use client";

import { useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { SwipePages, useSegmentDrag, useTrackOverflow } from "./gestures";
import { useStillNavBar } from "./nav-bar";
import { NextStepBar, type NextStepJob } from "./next-step-bar";
import { cx } from "./ui";

const PHONE = "(max-width: 639.98px)";

export interface JobSection {
  id: string;
  label: string;
  /** Shown as a small count after the label, e.g. checklist items still to do. */
  badge?: number;
  content: ReactNode;
}

const TAB_EVENT = "leakbook:job-tab";

/** The part named in the URL: ?tab=checklist, or an older link's #checklist. */
function tabInUrl() {
  return new URLSearchParams(window.location.search).get("tab") ?? window.location.hash.slice(1);
}

/**
 * The job page in parts, one at a time, on every screen (owner, 2026-10-22: "The browser's job
 * page need different tabs too just like mobile"): a segmented switcher under the title, pinned
 * under the navigation bar on phones (the page was 15 screens long). The part shown is kept in
 * the URL (?tab=checklist) so a reload, a shared link, or Back to the job returns to it. Wider
 * screens use their width inside a part, and on the widest the checklist has its part's
 * neighbour (`beside`, the pool diagram and findings) next to it.
 */
export function JobSections({
  sections,
  nextStep,
  initial,
  beside,
}: {
  sections: JobSection[];
  /** The job, for the phone's Next Step bar (owner, 2026-10-20). */
  nextStep?: NextStepJob;
  /** The part the request asked for (?tab=), so the first paint shows it. */
  initial?: string;
  /** A part shown beside another on wide screens: { checklist: "findings" }. */
  beside?: Record<string, string>;
}) {
  const asked = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("hashchange", onChange);
      window.addEventListener("popstate", onChange);
      window.addEventListener(TAB_EVENT, onChange);
      return () => {
        window.removeEventListener("hashchange", onChange);
        window.removeEventListener("popstate", onChange);
        window.removeEventListener(TAB_EVENT, onChange);
      };
    },
    tabInUrl,
    () => initial ?? "",
  );
  const active = sections.some((s) => s.id === asked) ? asked : sections[0]!.id;
  const companion = beside?.[active];

  const index = sections.findIndex((s) => s.id === active);
  // Hold the chosen part and drag it along, and swipe across the page for the next or previous
  // part, as the iPhone app's (owner, 2026-10-20: "navigate the different job pages with
  // gestures").
  const { held, handlers } = useSegmentDrag(index, (i) => choose(sections[i]!.id));
  const shown = held ?? index;
  const track = useTrackOverflow<HTMLDivElement>(index);
  // Swipes between parts are for phones.
  const phone = useSyncExternalStore(
    (onChange) => {
      const q = matchMedia(PHONE);
      q.addEventListener("change", onChange);
      return () => q.removeEventListener("change", onChange);
    },
    () => matchMedia(PHONE).matches,
    () => false,
  );
  // Every section sits on tiles: the bar keeps its large title on all of them, so switching
  // sections never moves it (owner, 2026-10-20 and 2026-10-21: on Findings and Wrap Up "the
  // navigation bar should not shrink"; the same on every section, as the iPhone app).
  useStillNavBar(phone);
  const go = (step: number) => {
    const next = sections[index + step];
    if (next) choose(next.id);
  };
  // Each part keeps its place: going back to it returns to where it was (gestures.md 4).
  const scrolled = useRef(new Map<string, number>());
  const restore = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (restore.current == null) return;
    window.scrollTo({ top: restore.current });
    restore.current = null;
  }, [active]);

  function choose(id: string) {
    if (id === active) return;
    scrolled.current.set(active, window.scrollY);
    // replaceState keeps Back for leaving the job; tell the store the part changed.
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    url.hash = "";
    history.replaceState(null, "", url);
    window.dispatchEvent(new Event(TAB_EVENT));
    restore.current = scrolled.current.get(id) ?? 0;
  }

  return (
    <>
      {/* As in iOS: the segmented control sits on the page, and once scrolled it stays under
          the navigation bar on the same frosted bar, one hairline below both (no floating
          card). */}
      <div className="nav-accessory glass-bar sticky top-[calc(2.75rem+env(safe-area-inset-top))] z-20 -mx-4 mb-4 px-4 py-2 sm:static sm:mx-0 sm:mb-6 sm:max-w-2xl sm:px-0 sm:py-0">
        {/* Five equal segments; a label that needs more room gets its own width, and with
            large text the row scrolls inside the track (useTrackOverflow) instead of the
            labels running into each other. */}
        <div
          ref={track}
          role="tablist"
          aria-label="Job sections"
          className="segment-scroll grid auto-cols-[minmax(max-content,1fr)] grid-flow-col gap-0.5 rounded-full bg-fill p-0.5 touch-pan-y select-none"
          {...handlers}
        >
          {sections.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`tab-${s.id}`}
              aria-selected={active === s.id}
              aria-controls={`part-${s.id}`}
              data-segment
              onClick={() => choose(s.id)}
              // The iOS segmented control: the chosen part on a raised white thumb.
              className={cx(
                // The side padding grows only once the text is larger than usual.
                "relative min-h-11 rounded-full px-[max(0.25rem,calc(0.75rem-8px))] text-[0.8125rem] whitespace-nowrap",
                "transition-[color,background-color,transform] duration-200 motion-reduce:transition-none",
                held === i && "scale-[1.06] shadow-lg",
                shown === i
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
      <SwipePages
        page={active}
        enabled={phone}
        canPrev={index > 0}
        canNext={index < sections.length - 1}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
      >
        <div
          className={cx(
            companion &&
              "xl:grid xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start xl:gap-8",
          )}
        >
          {sections.map((s) => (
            <div
              key={s.id}
              id={`part-${s.id}`}
              role="tabpanel"
              aria-labelledby={`tab-${s.id}`}
              className={cx(
                active === s.id
                  ? undefined
                  : companion === s.id
                    ? // Beside the chosen part on the widest screens only.
                      "hidden xl:block"
                    : "hidden",
              )}
            >
              {s.content}
            </div>
          ))}
        </div>
      </SwipePages>
      {nextStep ? <NextStepBar section={active} job={nextStep} /> : null}
    </>
  );
}
