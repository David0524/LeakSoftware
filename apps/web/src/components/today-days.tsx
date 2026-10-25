"use client";

import { PillRow } from "./pill-row";
import { useMemo, useState, type ReactNode } from "react";
import { TechDot } from "./tech-dot";
import { TeamToday, type TeamRow } from "./team-today";
import { ReorderSlots } from "./today-reorder";
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
  /**
   * The owner's Team row for this tech (owner, 2026-10-22: progress live): their ring, the stop
   * they're on and the last one done. Only for days with stops, on owners' and admins' Today.
   */
  team?: TeamRow;
  /** The signed-in person's own day. */
  mine?: boolean;
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
}: {
  days: TodayDay[];
  initial: string;
  navAction?: ReactNode;
  subtitle: ReactNode;
  /** Between the title and Whose Day (Getting Started). */
  intro?: ReactNode;
  /** Computers: under the map in the right column (Activity). */
  aside?: ReactNode;
}) {
  const [shown, setShown] = useState(initial);
  // Reorder's two places, filled by the day's content (ReorderToggle).
  const [navSlot, setNavSlot] = useState<HTMLElement | null>(null);
  const [barSlot, setBarSlot] = useState<HTMLElement | null>(null);
  const slots = useMemo(
    () => [navSlot, barSlot].filter((el): el is HTMLElement => el != null),
    [navSlot, barSlot],
  );
  const at = Math.max(
    0,
    days.findIndex((d) => d.id === shown),
  );
  const day = days[at]!;
  // The Team list shows once another tech has stops today (owner, 2026-10-22).
  const team = days.length > 1 && days.some((d) => d.team && !d.mine);
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
    <div className="@container/today max-w-2xl lg:grid lg:max-w-none lg:grid-cols-2 lg:items-start lg:gap-8">
      <div className="min-w-0">
        {/* Reorder's places (ReorderToggle fills them for the day shown): beside "+" in the
            phone's bar, at the end of the title row on computers. */}
        <PageHeader
          title={day.title}
          navAction={
            <span className="flex items-center gap-1">
              <span
                ref={setNavSlot}
                data-slot="nav"
                data-testid="today-reorder"
                className="contents"
              />
              {navAction}
            </span>
          }
          subtitle={subtitle}
          actions={
            <span
              ref={setBarSlot}
              data-slot="bar"
              data-testid="today-reorder"
              className="contents"
            />
          }
          // Phones keep Reorder in the bar, unless the bar is too narrow for it (zoom or text
          // at 200%): then it's at the end of the title row.
          actionsClassName="max-sm:hidden max-sm:@max-[13.5rem]/today:flex"
        />
        {intro}
        {/* The Team list is on computers only, at the top of the right column (owner,
            2026-10-22, of it on a phone: "I do not like this … definitely not on mobile"). */}
        {days.length > 1 ? (
          // Computers with the Team list pick the day there instead (owner, 2026-10-22: "make
          // the names on the right side the selector").
          <PillRow
            label="Whose day"
            className={cx("-mx-4 mb-5 flex gap-2 overflow-x-auto px-4", team && "lg:hidden")}
          >
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
          </PillRow>
        ) : null}
        {/* No page-wide swipe between techs' days: Whose Day is the way (owner, 2026-10-21:
            "too many gestures"). */}
        <ReorderSlots value={slots}>
          <div key={day.id}>{day.content}</div>
        </ReorderSlots>
      </div>
      {/* Under the desktop bar (3.5rem) and the page's top space, staying in view. */}
      <aside
        aria-label="Map and Activity"
        data-testid="today-side"
        // A hairline between the day and this column (owner, 2026-10-22: "We need some sort of
        // divider").
        className="sticky top-[5.5rem] hidden min-w-0 lg:block lg:border-l lg:border-separator lg:pl-8"
      >
        {team ? (
          <TeamToday
            days={days}
            shown={day.id}
            onPick={(id) => pick(days.findIndex((d) => d.id === id))}
            className="mb-6"
          />
        ) : null}
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
