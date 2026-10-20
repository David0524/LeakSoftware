import { useEffect, useMemo, useState } from "react";
import {
  estimateDriveMinutes,
  localDate,
  localMinutes,
  lockColumns,
  pointKey,
  propertyLocation,
  routingSettings,
  type Company,
  type DriveFn,
  type JobChange,
  type JobLock,
  type LatLng,
  type PlanContext,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { getServices } from "../lib/services";
import { useRows } from "./hooks";
import { inRouteOrderViews, type JobView } from "./jobs";

// Routes on the phone (spec 5.1, 5.6): each tech's jobs for a day in route order, from the
// phone's database, with drive times from the shop's cache on the server when there's a
// signal (the same cache the website fills) and the shared estimate otherwise.

/** The shop's planning context: its time zone, working day, location, and now. */
export function planContext(company: Company): PlanContext {
  const now = new Date();
  return {
    timeZone: company.timezone,
    settings: routingSettings(company.settings),
    depot: propertyLocation(company as { latitude?: number | null; longitude?: number | null }),
    today: localDate(now, company.timezone),
    nowMin: localMinutes(now.toISOString(), company.timezone),
  };
}

export interface TeamMember {
  user_id: string;
  role: "owner" | "admin" | "tech";
  status: "active" | "disabled";
  membership_id: string;
  name: string;
  email: string | null;
}

/** The shop's people (memberships with their names), by name, as the website lists them. */
export function useTeam(companyId: string): TeamMember[] {
  const members = useRows<{
    id: string;
    user_id: string;
    role: TeamMember["role"];
    status: TeamMember["status"];
    deleted_at?: string | null;
  }>("membership", companyId);
  const profiles = getServices().sync.team();
  return useMemo(() => {
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return members
      .filter((m) => !m.deleted_at)
      .map((m) => {
        const p = byId.get(m.user_id);
        return {
          user_id: m.user_id,
          membership_id: m.id,
          role: m.role,
          status: m.status,
          name: p?.full_name || p?.email || "Teammate",
          email: p?.email ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- profiles are read with members
  }, [members]);
}

export const routeKey = (techId: string | null, date: string) => `${techId ?? "none"}|${date}`;

/** Jobs on these dates by tech and day, in route order, and those with nobody assigned. */
export function routesFor(jobs: JobView[], dates: string[], timeZone: string) {
  const wanted = new Set(dates);
  const routes = new Map<string, JobView[]>();
  const unassigned = new Map<string, JobView[]>();
  for (const j of jobs) {
    if (j.deleted_at || j.status === "canceled" || !j.scheduled_start) continue;
    const date = localDate(new Date(j.scheduled_start), timeZone);
    if (!wanted.has(date)) continue;
    if (!j.assigned_user_id) {
      unassigned.set(date, [...(unassigned.get(date) ?? []), j]);
      continue;
    }
    for (const tech of [j.assigned_user_id, j.second_tech_id]) {
      if (!tech) continue;
      const key = routeKey(tech, date);
      routes.set(key, [...(routes.get(key) ?? []), j]);
    }
  }
  for (const [k, list] of routes) routes.set(k, inRouteOrderViews(list));
  for (const [k, list] of unassigned) unassigned.set(k, inRouteOrderViews(list));
  return { routes, unassigned };
}

/**
 * Needs a Time: jobs without a time, oldest first, then booked jobs from today on with
 * nobody assigned, soonest first (the website's needsScheduling).
 */
export function needsATime(jobs: JobView[], today: string, timeZone: string): JobView[] {
  const live = jobs.filter((j) => !j.deleted_at);
  const waiting = live
    .filter((j) => j.status === "unscheduled")
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const untech = live
    .filter(
      (j) =>
        j.status === "scheduled" &&
        !j.assigned_user_id &&
        j.scheduled_start &&
        localDate(new Date(j.scheduled_start), timeZone) >= today,
    )
    .sort((a, b) => (a.scheduled_start ?? "").localeCompare(b.scheduled_start ?? ""));
  return [...waiting, ...untech];
}

/** Save a job's lock (core lockColumns: lock_day, lock_time, arrival_fixed) through sync. */
export function saveJobLock(companyId: string, jobId: string, lock: JobLock) {
  const { sync } = getServices();
  sync.batch(() => sync.write("job", jobId, companyId, { ...lockColumns(lock) }));
}

/** Save schedule changes through the sync layer, all or none. */
export function saveJobChanges(companyId: string, updates: JobChange[]) {
  const { sync } = getServices();
  sync.batch(() => {
    for (const { id, ...values } of updates)
      sync.write("job", id, companyId, values as Record<string, JsonValue>);
  });
}

// ---------------------------------------------------------------------------
// Drive times
// ---------------------------------------------------------------------------

/** Minutes between point keys ("from>to") the server's cache returned, kept for this run. */
const known = new Map<string, number>();
const asked = new Set<string>();

/**
 * Drive times between these points: the shop's cached times from the server (a day old at
 * most) when online, the estimate for anything missing. `live` says whether any came from the
 * server, so screens can say "estimate" offline.
 */
export function useDriveTimes(
  companyId: string,
  points: (LatLng | null)[],
): { drive: DriveFn; live: boolean } {
  const pointsKey = [...new Set(points.filter((p): p is LatLng => !!p).map(pointKey))]
    .sort()
    .join(";");
  const keys = useMemo(() => (pointsKey ? pointsKey.split(";") : []), [pointsKey]);
  const id = `${companyId}:${keys.join(";")}`;
  const [version, setVersion] = useState(0);
  const [live, setLive] = useState(() => asked.has(id));

  useEffect(() => {
    if (keys.length < 2 || asked.has(id)) return;
    let gone = false;
    void (async () => {
      const { data, error } = await getServices().supabase.rpc("cached_drive_times", {
        target_company: companyId,
        from_keys: keys,
        to_keys: keys,
      });
      if (error || gone) return;
      asked.add(id);
      for (const r of (data ?? []) as { from_key: string; to_key: string; minutes: number }[])
        known.set(`${r.from_key}>${r.to_key}`, r.minutes);
      setLive(true);
      setVersion((v) => v + 1);
    })().catch(() => {});
    return () => {
      gone = true;
    };
  }, [companyId, id, keys]);

  // The same function until new drive times arrive, so what's worked out from it (each route's
  // summary) is kept between renders (owner, 2026-10-20: a smooth schedule).
  const drive = useMemo<DriveFn>(
    () => (a, b) => {
      if (!a || !b) return 0;
      return known.get(`${pointKey(a)}>${pointKey(b)}`) ?? estimateDriveMinutes(a, b);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version marks new drive times
    [version],
  );
  return { drive, live };
}
