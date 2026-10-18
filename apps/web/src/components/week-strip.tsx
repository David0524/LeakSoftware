"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type PointerEvent } from "react";
import { addDays, dateFormat, formatDay, scheduleDays } from "@leakbook/core";
import { cx } from "./ui";

const weekday = dateFormat("en-US", { weekday: "short", timeZone: "UTC" });

/**
 * Schedule › Day: the week's days in a strip. Swipe it sideways for the week before or after
 * (owner, 2026-10-18): the strip follows the finger, and letting go past a quarter of the way
 * (or with a flick) settles on that week, on the same weekday, as iOS Calendar does.
 */
export function WeekStrip({ date, today, tech }: { date: string; today: string; tech: string }) {
  const router = useRouter();
  // The week in the middle and the day picked: ahead of the page while it loads the new day.
  const [shown, setShown] = useState({ date, from: date });
  if (shown.from !== date) setShown({ date, from: date });
  const selected = shown.date;
  // Where the strip is: dragged px, and which week it's settling on (-1, 0, 1).
  const [drag, setDrag] = useState<{ dx: number; to: number; animate: boolean }>({
    dx: 0,
    to: 0,
    animate: false,
  });
  const box = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; t: number; id: number; sideways?: boolean } | null>(
    null,
  );
  // A drag shouldn't also open the day it started on.
  const dragged = useRef(false);

  const href = (d: string) => `/schedule?view=day&date=${d}&tech=${tech}`;
  const weeks = [-7, 0, 7].map((n) => scheduleDays("week", addDays(selected, n)));

  function down(e: PointerEvent) {
    if (drag.animate || (e.pointerType === "mouse" && e.button !== 0)) return;
    touch.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
    dragged.current = false;
  }
  function move(e: PointerEvent) {
    const t = touch.current;
    if (!t || t.id !== e.pointerId) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (t.sideways === undefined) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      t.sideways = Math.abs(dx) > Math.abs(dy);
      if (!t.sideways) {
        touch.current = null;
        return;
      }
      dragged.current = true;
      box.current?.setPointerCapture(e.pointerId);
    }
    setDrag({ dx, to: 0, animate: false });
  }
  function up(e: PointerEvent) {
    const t = touch.current;
    touch.current = null;
    if (!t?.sideways) return;
    const dx = e.clientX - t.x;
    const width = box.current?.clientWidth ?? 320;
    const speed = dx / Math.max(1, e.timeStamp - t.t);
    const to =
      dx < -width / 4 || (dx < -20 && speed < -0.4)
        ? 1
        : dx > width / 4 || (dx > 20 && speed > 0.4)
          ? -1
          : 0;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) settle(to);
    else {
      setDrag({ dx: 0, to, animate: true });
      // Settles once the slide is over (a timer, as a transition that moved nowhere never ends).
      setTimeout(() => settle(to), 300);
    }
  }
  function settle(to: number) {
    setDrag({ dx: 0, to: 0, animate: false });
    if (to === 0) return;
    const next = addDays(selected, 7 * to);
    setShown({ date: next, from: date });
    router.push(href(next), { scroll: false });
  }

  return (
    <div
      ref={box}
      className="-mx-4 mb-4 touch-pan-y overflow-hidden select-none"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClickCapture={(e) => {
        if (dragged.current) {
          e.preventDefault();
          e.stopPropagation();
          dragged.current = false;
        }
      }}
    >
      <div
        className={cx(
          "flex w-[300%]",
          drag.animate && "transition-transform duration-300 ease-out",
        )}
        style={{
          transform: `translateX(calc(${(-1 - drag.to) * (100 / 3)}% + ${drag.dx}px))`,
        }}
      >
        {weeks.map((week, i) => (
          <nav
            key={week[0]}
            aria-label={i === 1 ? "Days this week" : undefined}
            aria-hidden={i === 1 ? undefined : true}
            inert={i !== 1}
            className="flex w-1/3 gap-1 px-4 pb-1"
          >
            {week.map((d) => {
              const at = new Date(`${d}T12:00:00Z`);
              return (
                <Link
                  key={d}
                  href={href(d)}
                  scroll={false}
                  draggable={false}
                  onClick={() => setShown({ date: d, from: date })}
                  aria-current={d === selected ? "date" : undefined}
                  aria-label={formatDay(d, "long")}
                  className={cx(
                    "flex min-h-14 min-w-12 flex-1 flex-col items-center justify-center rounded-xl text-[0.8125rem] font-medium",
                    d === selected
                      ? "bg-text text-bg"
                      : d === today
                        ? "text-link"
                        : "hover:bg-surface",
                  )}
                >
                  {weekday.format(at)}
                  <span className="font-display text-xl font-bold">{at.getUTCDate()}</span>
                </Link>
              );
            })}
          </nav>
        ))}
      </div>
    </div>
  );
}
