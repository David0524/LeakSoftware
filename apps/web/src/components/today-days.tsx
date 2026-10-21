"use client";

import { useState, type ReactNode } from "react";
import { TechDot } from "./tech-dot";
import { PageHeader, cx, pillClass } from "./ui";

export interface TodayDay {
  /** The tech whose day it is. */
  id: string;
  /** In Whose Day: "Me" or the tech's name. */
  label: string;
  /** Their color: a dot before the name (owner, 2026-10-20). */
  color?: string | null;
  /** The page title: "Today" or "Today · Priya Shah". */
  title: string;
  content: ReactNode;
  /** Computers: Today's Map for this day, at the top of the right column. */
  map?: ReactNode;
}

/**
 * Today's days, one per tech, for owners and admins. Every day comes with the page, so Whose
 * Day switches in the browser without a trip to the server. There is no sideways swipe between
 * days (owner, 2026-10-21: Today had "too many gestures"). The
 * address keeps ?tech= so a reload or a shared link opens the same day.
 *
 * On a computer (lg and up) the day takes the left half and a right column stays in view
 * beside it: the shown day's map, then `aside` (owner, 2026-10-21: "The desktop today page
 * looks awkwardly wide"). Phones and tablets keep one column, no wider than a reading width.
 */
export function TodayDays({
  days,
  initial,
  navAction,
  subtitle,
  intro,
  aside,
  footer,
}: {
  days: TodayDay[];
  initial: string;
  navAction?: ReactNode;
  subtitle: ReactNode;
  /** Between the title and Whose Day (Getting Started). */
  intro?: ReactNode;
  /** Computers: under the map in the right column (Activity). */
  aside?: ReactNode;
  /** Under the day, in its column (the screen tip). */
  footer?: ReactNode;
}) {
  const [shown, setShown] = useState(initial);
  const at = Math.max(
    0,
    days.findIndex((d) => d.id === shown),
  );
  const day = days[at]!;
  const pick = (i: number) => {
    const d = days[i];
    if (!d) return;
    setShown(d.id);
    window.history.replaceState(null, "", `/today?tech=${d.id}`);
    document
      .getElementById(`whose-${d.id}`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  return (
    <div className="max-w-2xl lg:grid lg:max-w-none lg:grid-cols-2 lg:items-start lg:gap-8">
      <div className="min-w-0">
        <PageHeader title={day.title} navAction={navAction} subtitle={subtitle} />
        {intro}
        {days.length > 1 ? (
          <nav aria-label="Whose day" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4">
            {days.map((d, i) => (
              <a
                key={d.id}
                id={`whose-${d.id}`}
                href={`/today?tech=${d.id}`}
                aria-current={i === at ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  pick(i);
                }}
                className={pillClass(i === at, "gap-2")}
              >
                <TechDot color={d.color} className={cx(i === at && "ring-2 ring-white/90")} />
                {d.label}
              </a>
            ))}
          </nav>
        ) : null}
        {/* No page-wide swipe between techs' days: Whose Day is the way (owner, 2026-10-21:
            "too many gestures"). */}
        <div key={day.id}>{day.content}</div>
        {footer}
      </div>
      {/* Under the desktop bar (3.5rem) and the page's top space, staying in view. */}
      <aside
        aria-label="Map and Activity"
        data-testid="today-side"
        className="sticky top-[5.5rem] hidden min-w-0 lg:block"
      >
        <section aria-labelledby="today-map-title">
          <h2 id="today-map-title" className="mb-2 px-4 text-[0.8125rem] text-text-muted uppercase">
            Today’s Map
          </h2>
          <div key={day.id}>{day.map}</div>
        </section>
        {aside}
      </aside>
    </div>
  );
}
