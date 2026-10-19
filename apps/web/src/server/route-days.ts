import "server-only";
import {
  daySummary,
  formatAddress,
  inRouteOrder,
  localDate,
  localMinutes,
  propertyLocation,
  routingSettings,
  seesAllJobs,
  scheduleBounds,
  workDay,
  zonedTimeToIso,
  type DaySummary,
  type DriveFn,
  type LatLng,
  type RoutingSettings,
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
import { driveTimes, geocodeAddress, routingConfigured } from "./routing";

// Routes as the schedule, Today, and the planning actions see them: each tech's jobs for a
// day in route order, with drive times between them.

export interface RouteContext {
  timeZone: string;
  settings: RoutingSettings;
  depot: LatLng | null;
  depotAddress: string;
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
  const company = await getCompany(office);
  const now = new Date();
  return {
    timeZone: office.company.timezone,
    settings: routingSettings(company.settings),
    depot: propertyLocation(company as { latitude?: number | null; longitude?: number | null }),
    depotAddress: formatAddress(company as unknown as Parameters<typeof formatAddress>[0]),
    shopName: company.name,
    shopZip: (company.postal_code as string | null) ?? null,
    seesAll: seesAllJobs(office.company.role, company.settings),
    live: routingConfigured(),
    today: localDate(now, office.company.timezone),
    nowMin: localMinutes(now.toISOString(), office.company.timezone),
  };
}

export interface DayRoute {
  techId: string;
  techName: string;
  date: string;
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
  await locateStops(office, jobs);
  const points = [ctx.depot, ...jobs.map((j) => propertyLocation(j.property))].filter(
    (p): p is LatLng => !!p,
  );
  const drive = await driveTimes(await createClient(), office.company.id, points, { live });
  const routes = new Map<string, DayRoute>();
  for (const [key, d] of byKey) {
    const ordered = inRouteOrder(d.jobs);
    routes.set(key, {
      techId: d.techId,
      techName: names.get(d.techId) ?? "Teammate",
      date: d.date,
      jobs: ordered,
      summary: daySummary(
        ordered.map((j) => ({
          id: j.id,
          location: propertyLocation(j.property),
          startMin: j.scheduled_start ? localMinutes(j.scheduled_start, ctx.timeZone) : null,
          endMin: j.scheduled_end ? localMinutes(j.scheduled_end, ctx.timeZone) : null,
        })),
        ctx.depot,
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
async function locateStops(office: Office, jobs: JobRow[]): Promise<void> {
  if (!routingConfigured()) return;
  const missing = [
    ...new Map(
      jobs
        .filter((j) => j.property && !propertyLocation(j.property) && j.property.address_line1)
        .map((j) => [j.property!.id, j.property!]),
    ).values(),
  ].slice(0, LOOKUPS_PER_LOAD);
  const found = await Promise.all(
    missing.map(async (p) => [p.id, await lookUpProperty(office, p.id)] as const),
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
  if (!routingConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("property")
    .select("id, address_line1, city, state, postal_code, geocoded_address")
    .eq("id", propertyId)
    .maybeSingle();
  const p = data as
    (Parameters<typeof formatAddress>[0] & { geocoded_address: string | null }) | null;
  if (!p) return null;
  const address = formatAddress(p);
  // Coordinates are kept with the address they belong to, whether looked up, marked at the
  // pool by GPS, or set by hand: only a changed address needs a new lookup.
  if (p.geocoded_address === address) return null;
  const found = await geocodeAddress(supabase, office.company.id, address);
  if (!found) return null;
  const { error } = await supabase
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
  if (!routingConfigured()) return false;
  const supabase = await createClient();
  const company = await getCompany(office);
  const address = formatAddress(company as unknown as Parameters<typeof formatAddress>[0]);
  if (!address || company.geocoded_address === address) return false;
  const found = await geocodeAddress(supabase, office.company.id, address);
  if (!found) return false;
  const { error } = await supabase
    .from("company")
    .update({ latitude: found.lat, longitude: found.lng, geocoded_address: address })
    .eq("id", office.company.id);
  return !error;
}
