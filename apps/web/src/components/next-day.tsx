import Link from "next/link";
import type { NextDayCard } from "@leakbook/core";
import { Empty, buttonClass } from "./ui";

/**
 * An empty Today (owner, 2026-10-29: "An empty Today shows what's next"): the next day with
 * stops, up to two weeks out, with a way to see it on the Schedule; else the old line and its
 * link to the Schedule.
 */
export function NextDay({ empty, card }: { empty: string; card: NextDayCard | null }) {
  if (!card)
    return (
      <Empty>
        {empty}{" "}
        <Link href="/schedule" className="text-link underline">
          Open the schedule
        </Link>
        .
      </Empty>
    );
  return (
    <div className="space-y-3">
      <p className="px-1 text-text-muted">{empty}</p>
      <section aria-labelledby="next-day" className="card space-y-1 p-5">
        <h2 id="next-day" className="font-display text-xl font-bold">
          {card.heading}
        </h2>
        <p>{card.line}</p>
        <p className="text-text-muted">{card.names}</p>
        <div className="flex justify-end pt-3">
          <Link href={`/schedule?view=day&date=${card.date}`} className={buttonClass("secondary")}>
            {card.button}
          </Link>
        </div>
      </section>
    </div>
  );
}
