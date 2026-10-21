import Link from "next/link";
import {
  ACTIVITY_EMPTY,
  ACTIVITY_OFFLINE,
  ACTIVITY_TITLE,
  SEARCH_WORDS,
  activityRow,
} from "@leakbook/core";
import { ActivityItem } from "@/components/activity-rows";
import { Dot } from "@/components/nav-links";
import { Empty } from "@/components/ui";
import { activityPage, activityUnread } from "@/lib/activity";
import { getOffice } from "@/lib/auth";

/** Beside the day on a computer: enough to see what just happened without leaving Today. */
const TODAY_ACTIVITY_COUNT = 5;

/**
 * Activity under Today's Map on a computer (owner, 2026-10-21): the latest events, See All,
 * and the dot when there is something new. It streams in after the day, so the stops never
 * wait for it. Each person sees the events about what they can open (row security), so a tech
 * sees their own work. Looking here doesn't clear the dot; opening Activity does.
 */
export async function TodayActivity() {
  const office = await getOffice();
  const [page, dot] = await Promise.all([
    activityPage(office, null, TODAY_ACTIVITY_COUNT).catch(() => null),
    activityUnread(office),
  ]);
  const now = new Date();
  return (
    <section aria-labelledby="today-activity-title" className="mt-6">
      <div className="mb-2 flex items-end justify-between gap-3 px-4">
        <h2
          id="today-activity-title"
          className="flex items-center gap-2 text-[0.8125rem] text-text-muted uppercase"
        >
          {ACTIVITY_TITLE}
          {dot ? <Dot label="New activity" /> : null}
        </h2>
        <Link
          href="/activity"
          className="-my-3 inline-flex min-h-11 items-center text-[0.9375rem] text-link"
          aria-label={`${SEARCH_WORDS.seeAll} ${ACTIVITY_TITLE}`}
        >
          {SEARCH_WORDS.seeAll}
        </Link>
      </div>
      {!page ? (
        <Empty>{ACTIVITY_OFFLINE}</Empty>
      ) : page.events.length === 0 ? (
        <Empty>{ACTIVITY_EMPTY}</Empty>
      ) : (
        <ul className="grouped">
          {page.events.map((e) => (
            <ActivityItem key={e.id} row={activityRow(e, now, office.company.timezone)} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The box Activity takes while it loads, so the map above it stays put. */
export function TodayActivityLoading() {
  return (
    <div aria-hidden="true" className="mt-6">
      <div className="mb-2 h-5 px-4" />
      <div className="grouped h-56" />
    </div>
  );
}
