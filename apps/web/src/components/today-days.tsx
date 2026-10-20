"use client";

import { useState, type ReactNode } from "react";
import { SwipePages } from "./gestures";
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
}

/**
 * Today's days, one per tech, for owners and admins (gestures.md section 4: "swipe through the
 * different tech's views"). Every day comes with the page, so Whose Day and a swipe switch in
 * the browser without a trip to the server, in the control's order, stopping at either end. The
 * address keeps ?tech= so a reload or a shared link opens the same day.
 */
export function TodayDays({
  days,
  initial,
  navAction,
  subtitle,
  intro,
}: {
  days: TodayDay[];
  initial: string;
  navAction?: ReactNode;
  subtitle: ReactNode;
  /** Between the title and Whose Day (Getting Started). */
  intro?: ReactNode;
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
    <>
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
      <SwipePages
        page={day.id}
        enabled={days.length > 1}
        canPrev={at > 0}
        canNext={at < days.length - 1}
        onPrev={() => pick(at - 1)}
        onNext={() => pick(at + 1)}
      >
        <div key={day.id}>{day.content}</div>
      </SwipePages>
    </>
  );
}
