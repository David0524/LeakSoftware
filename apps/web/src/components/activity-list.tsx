"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ACTIVITY_OFFLINE,
  activityEmpty,
  groupActivity,
  type ActivityEvent,
  type JobTypeFilter,
} from "@leakbook/core";
import { markActivitySeen, moreActivity } from "@/app/actions/activity";
import { ActivityItem } from "./activity-rows";
import { Button, Empty, SectionTitle } from "./ui";

/**
 * More › Activity: everything that happened, newest first, under day headers; 50 at a time,
 * the next 50 loading as the end scrolls into view (or with Show More). Opening it clears the
 * dot on More and on the Activity row.
 */
export function ActivityList({
  initial,
  more: initialMore,
  timeZone,
  type = "all",
}: {
  initial: ActivityEvent[];
  more: boolean;
  timeZone: string;
  /** The Type menu's choice (owner, 2026-10-22); the next pages keep it. */
  type?: JobTypeFilter;
}) {
  const router = useRouter();
  const [events, setEvents] = useState(initial);
  const [more, setMore] = useState(initialMore);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  useEffect(() => {
    markActivitySeen().then(
      () => router.refresh(),
      () => {},
    );
  }, [router]);

  const load = async () => {
    const last = events[events.length - 1];
    if (!last || busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const page = await moreActivity({ at: last.created_at, id: last.id }, type);
      setEvents((e) => [...e, ...page.events.filter((x) => !e.some((y) => y.id === x.id))]);
      setMore(page.more);
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!more || offline || !end.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) void loadRef.current();
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(end.current);
    return () => io.disconnect();
  }, [more, offline, events.length]);

  if (events.length === 0) return <Empty>{activityEmpty(type)}</Empty>;
  const days = groupActivity(events, new Date(), timeZone);
  return (
    <div className="max-w-2xl space-y-6">
      {days.map((d) => (
        <section key={d.key} aria-label={d.title}>
          <SectionTitle>{d.title}</SectionTitle>
          <ul className="grouped">
            {d.rows.map((r) => (
              <ActivityItem key={r.id} row={r} />
            ))}
          </ul>
        </section>
      ))}
      <div ref={end} className="flex flex-col items-center gap-2">
        {offline ? (
          <p role="alert" className="text-center text-text-muted">
            {ACTIVITY_OFFLINE}
          </p>
        ) : null}
        {more ? (
          <Button type="button" kind="secondary" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Show More"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
