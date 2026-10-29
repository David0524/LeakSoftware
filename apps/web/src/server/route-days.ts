import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addDays,
  daySummary,
  NEXT_DAY_LOOKAHEAD,
  formatAddress,
  inRouteOrder,
  localDate,
  localMinutes,
  propertyLocation,
  routingSettings,
  seesAllJobs,
  scheduleBounds,
  startFor,
  workDay,
  zonedTimeToIso,
  type DaySummary,
  type DriveFn,
  type LatLng,
  type RouteStart,
  type RoutingSettings,
  type UpcomingStop,
} from "@leakbook/core";
import type { Office } from "@/lib/auth";
import {
  getCompany,
  getTeam,
  jobsBetween,
  listJobs,
  unassignedFrom,
  type JobRow,
  type TeamMember,
} from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { loadStarts, type StartRow } from "./member-start";
import { driveTimes, geocodeAddress, routingConfigured } from "./routing";

// Routes as the schedule, Today, and the planning actions see them: each tech's jobs for a
// day in route order, with drive times between them.

export interface RouteContext {
  timeZone: string;
  settings: RoutingSettings;
  /** The shop. Each tech's route starts at techStart(ctx, techId), which may be their home. */
  depot: LatLng | null;
  depotAddress: string;
  /**
   * The member_start rows this person may route with: everyone's for owners and admins, only
   * their own for a tech (everyone else then starts at the shop).
   */
  starts: StartRow[];
  shopName: string;
  shopZip: string | null;
  /** False for a tech when the owner limits techs to their own jobs. */
  seesAll: boolean;
  /** Drive times come from the routing service (otherwise the estimate). */
  live: boolean;
  today: string;
  nowMin: number;
}

/** Today in the shop's time zone, without waiting for the company's settings. */
export const shopToday = (office: Office) => localDate(new Date(), office.company.timezone);

export async function routeContext(office: Office): Promise<RouteContext> {
  const [company, starts] = await Promise.all([
    getCompany(office),
    createClient().then((db) =>
      loadStarts(db, office.company.id, { userId: office.user.id, manager: office.isManager }),
    ),
  ]);
  const now = new Date();
  return {
    timeZone: office.company.timezone,
    settings: routingSettings(company.settings),
    depot: propertyLocation(company as { latitude?: number | null; longitude?: number | null }),
    depotAddress: formatAddress(company as unknown as Parameters<typeof formatAddress>[0]),
    starts,
    shopName: company.name,
    shopZip: (company.postal_code as string | null) ?? null,
    seesAll: seesAllJobs(office.company.role, company.settings),
    live: routingConfigured(),
    today: localDate(now, office.company.timezone),
    nowMin: localMinutes(now.toISOString(), office.company.timezone),
  };
}

/** Where this tech's days start and end: their home when set and on the map, else the shop. */
export function techStart(
  ctx: Pick<RouteContext, "depot" | "starts">,
  techId: string | null | undefined,
): RouteStart {
  return startFor(techId, ctx.starts, ctx.depot);
}

/** Every place a day can start from (the shop and each readable home), for drive times. */
export function startPoints(ctx: Pick<RouteContext, "depot" | "starts">): LatLng[] {
  return [ctx.depot, ...ctx.starts.map((s) => techStart(ctx, s.user_id).at)].filter(
    (p): p is LatLng => !!p,
  );
}

export interface DayRoute {
  techId: string;
  techName: string;
  date: string;
  /** Where this tech's day starts and ends (home or the shop). */
  start: RouteStart;
  /** In route order; includes jobs where this tech is the second tech. */
  jobs: JobRow[];
  summary: DaySummary;
}

export const routeKey = (techId: string | null, date: string) => `${techId ?? "none"}|${date}`;

/** Every tech's route for each date, plus the jobs on those dates with nobody assigned. */
export async function loadRoutes(
  office: Office,
  /** May still be loading: the jobs and team start without waiting for it. */
  ctxOrPromise: RouteContext | Promise<RouteContext>,
  dates: string[],
  { live = false }: { live?: boolean } = {},
): Promise<{
  routes: Map<string, DayRoute>;
  unassigned: Map<string, JobRow[]>;
  team: TeamMember[];
  drive: DriveFn;
}> {
  const { from, to } = scheduleBounds(dates, office.company.timezone);
  const [jobs, team, ctx] = await Promise.all([
    jobsBetween(office, from, to),
    getTeam(office),
    ctxOrPromise,
  ]);
  const names = new Map(team.map((t) => [t.user_id, t.name]));
  const byKey = new Map<string, { techId: string; date: string; jobs: JobRow[] }>();
  const unassigned = new Map<string, JobRow[]>();
  for (const j of jobs) {
    const date = localDate(new Date(j.scheduled_start!), ctx.timeZone);
    if (!j.assigned_user_id) {
      unassigned.set(date, [...(unassigned.get(date) ?? []), j]);
      continue;
    }
    for (const tech of [j.assigned_user_id, j.second_tech_id]) {
      if (!tech) continue;
      const key = routeKey(tech, date);
      const day = byKey.get(key) ?? { techId: tech, date, jobs: [] };
      day.jobs.push(j);
      byKey.set(key, day);
    }
  }
  // Pools not on the map yet are looked up. A page doesn't wait for it (lookups can take a few
  // seconds, and the schedule should open at once; owner, 2026-10-20): they finish after the
  // response, and the next load has them. Planning (live) waits, so its route counts them.
  // The signed-in client is made now: a page's `after` can't read cookies.
  const lookups = await createClient();
  if (live) await locateStops(office, jobs, lookups);
  else after(() => locateStops(office, jobs, lookups));
  const points = [
    ...startPoints(ctx),
    ...jobs.map((j) => propertyLocation(j.property)).filter((p): p is LatLng => !!p),
  ];
  const drive = await driveTimes(await createClient(), office.company.id, points, { live });
  const routes = new Map<string, DayRoute>();
  for (const [key, d] of byKey) {
    const ordered = inRouteOrder(d.jobs);
    const start = techStart(ctx, d.techId);
    routes.set(key, {
      techId: d.techId,
      techName: names.get(d.techId) ?? "Teammate",
      date: d.date,
      start,
      jobs: ordered,
      summary: daySummary(
        ordered.map((j) => ({
          id: j.id,
          location: propertyLocation(j.property),
          startMin: j.scheduled_start ? localMinutes(j.scheduled_start, ctx.timeZone) : null,
          endMin: j.scheduled_end ? localMinutes(j.scheduled_end, ctx.timeZone) : null,
        })),
        start.at,
        workDay(ctx.settings),
        drive,
      ),
    });
  }
  return { routes, unassigned, team, drive };
}

/**
 * Needs a Time: every job that isn't on someone's route. Jobs without a time, oldest
 * first (repairs from accepted quotes land here), then booked jobs with nobody assigned
 * (taken off a tech, or booked before choosing one), soonest first.
 */
export async function needsScheduling(office: Office): Promise<JobRow[]> {
  const tz = office.company.timezone;
  const [waiting, untech] = await Promise.all([
    listJobs(office, ["unscheduled"], { limit: 500 }),
    unassignedFrom(office, zonedTimeToIso(shopToday(office), "00:00", tz)),
  ]);
  return [
    ...waiting.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "")),
    ...untech,
  ];
}

/** At most this many pools are looked up each time a route is loaded. */
const LOOKUPS_PER_LOAD = 10;

/**
 * Pools on the day's stops with no map location are found from their address (owner,
 * 2026-10-19: "It should be able to navigate based on the provided address"), so pools added
 * on a phone are placed too. The jobs' properties get the coordinates in place.
 */
async function locateStops(office: Office, jobs: JobRow[], db: SupabaseClient): Promise<void> {
  if (!routingConfigured()) return;
  const missing = [
    ...new Map(
      jobs
        // Not yet tried at this address (a miss is kept, so the next ten get their turn).
        .filter(
          (j) =>
            j.property &&
            !propertyLocation(j.property) &&
            j.property.address_line1 &&
            (j.property as { geocoded_address?: string | null }).geocoded_address !==
              formatAddress(j.property),
        )
        .map((j) => [j.property!.id, j.property!]),
    ).values(),
  ].slice(0, LOOKUPS_PER_LOAD);
  const found = await Promise.all(
    missing.map(
      async (p) => [p.id, await locatePropertyWith(db, office.company.id, p.id)] as const,
    ),
  );
  for (const [id, at] of found) {
    if (!at) continue;
    for (const j of jobs) {
      if (j.property?.id === id) Object.assign(j.property, { latitude: at.lat, longitude: at.lng });
    }
  }
}

/**
 * Find a pool's coordinates from its address when the routing service is set up and the
 * address changed since the last lookup. Quietly does nothing otherwise.
 */
export async function locateProperty(office: Office, propertyId: string): Promise<boolean> {
  return !!(await lookUpProperty(office, propertyId));
}

async function lookUpProperty(office: Office, propertyId: string): Promise<LatLng | null> {
  return locatePropertyWith(await createClient(), office.company.id, propertyId);
}

/**
 * A pool's coordinates from its address, when the address changed since the last lookup, as
 * `db`'s person (the website's session, or a phone's, /api/locate).
 */
export async function locatePropertyWith(
  db: SupabaseClient,
  companyId: string,
  propertyId: string,
): Promise<LatLng | null> {
  if (!routingConfigured()) return null;
  const { data } = await db
    .from("property")
    .select("id, address_line1, city, state, postal_code, geocoded_address")
    .eq("id", propertyId)
    .eq("company_id", companyId)
    .maybeSingle();
  const p = data as
    (Parameters<typeof formatAddress>[0] & { geocoded_address: string | null }) | null;
  if (!p) return null;
  const address = formatAddress(p);
  // Coordinates are kept with the address they belong to, whether looked up, marked at the
  // pool by GPS, or set by hand: only a changed address needs a new lookup.
  if (!address || p.geocoded_address === address) return null;
  const found = await geocodeAddress(db, companyId, address);
  if (!found) {
    // Not found: kept with the address, so the same address isn't tried again on every load;
    // changing it tries again (owner, 2026-10-20).
    await db
      .from("property")
      .update({ geocoded_address: address })
      .eq("id", propertyId)
      .is("latitude", null);
    return null;
  }
  const { error } = await db
    .from("property")
    .update({
      latitude: found.lat,
      longitude: found.lng,
      geocoded_address: address,
      location_source: "geocoder",
    })
    .eq("id", propertyId);
  return error ? null : found;
}

/** The shop's coordinates from its address, when the address changed since the last lookup. */
export async function locateCompany(office: Office): Promise<boolean> {
  return !!(await locateCompanyWith(await createClient(), office.company.id));
}

export async function locateCompanyWith(
  db: SupabaseClient,
  companyId: string,
): Promise<LatLng | null> {
  if (!routingConfigured()) return null;
  const { data } = await db.from("company").select("*").eq("id", companyId).maybeSingle();
  if (!data) return null;
  const address = formatAddress(data as unknown as Parameters<typeof formatAddress>[0]);
  if (!address || (data as { geocoded_address: string | null }).geocoded_address === address)
    return null;
  const found = await geocodeAddress(db, companyId, address);
  if (!found) return null;
  const { error } = await db
    .from("company")
    .update({ latitude: found.lat, longitude: found.lng, geocoded_address: address })
    .eq("id", companyId);
  return error ? null : found;
}

/**
 * Each tech's stops on the two weeks after today, in route order, for an empty Today's next-day
 * card (owner, 2026-10-29: "An empty Today shows what's next"). Only the job rows: no routing.
 */
export async function upcomingStops(
  office: Office,
  ctx: Pick<RouteContext, "today" | "timeZone">,
  techIds: string[],
): Promise<Map<string, UpcomingStop[]>> {
  const out = new Map<string, UpcomingStop[]>();
  if (techIds.length === 0) return out;
  const dates = Array.from({ length: NEXT_DAY_LOOKAHEAD }, (_, i) => addDays(ctx.today, i + 1));
  const { from, to } = scheduleBounds(dates, ctx.timeZone);
  const jobs = await jobsBetween(office, from, to);
  for (const id of techIds) {
    const byDate = new Map<string, JobRow[]>();
    for (const j of jobs) {
      if (j.assigned_user_id !== id && j.second_tech_id !== id) continue;
      const date = localDate(new Date(j.scheduled_start!), ctx.timeZone);
      byDate.set(date, [...(byDate.get(date) ?? []), j]);
    }
    out.set(
      id,
      [...byDate].flatMap(([date, day]) =>
        inRouteOrder(day).map((j) => ({
          date,
          start: j.scheduled_start ?? null,
          name: j.customer?.name ?? "Customer",
        })),
      ),
    );
  }
  return out;
}
