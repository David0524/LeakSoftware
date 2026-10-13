import "server-only";
import {
  daySummary,
  formatAddress,
  inRouteOrder,
  localDate,
  localMinutes,
  propertyLocation,
  routingSettings,
  scheduleBounds,
  workDay,
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
  /** Drive times come from the routing service (otherwise the estimate). */
  live: boolean;
  today: string;
  nowMin: number;
}

export async function routeContext(office: Office): Promise<RouteContext> {
  const company = await getCompany(office);
  const now = new Date();
  return {
    timeZone: office.company.timezone,
    settings: routingSettings(company.settings),
    depot: propertyLocation(company as { latitude?: number | null; longitude?: number | null }),
    depotAddress: formatAddress(company as unknown as Parameters<typeof formatAddress>[0]),
    shopName: company.name,
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
  ctx: RouteContext,
  dates: string[],
  { live = false }: { live?: boolean } = {},
): Promise<{
  routes: Map<string, DayRoute>;
  unassigned: Map<string, JobRow[]>;
  team: TeamMember[];
  drive: DriveFn;
}> {
  const { from, to } = scheduleBounds(dates, ctx.timeZone);
  const [jobs, team] = await Promise.all([jobsBetween(office, from, to), getTeam(office)]);
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

/** Jobs waiting for a time, oldest first (repairs from accepted quotes land here). */
export async function unscheduledJobs(office: Office): Promise<JobRow[]> {
  const jobs = await listJobs(office, ["unscheduled"]);
  return jobs.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
}

/**
 * Find a pool's coordinates from its address when the routing service is set up and the
 * address changed since the last lookup. Quietly does nothing otherwise.
 */
export async function locateProperty(office: Office, propertyId: string): Promise<boolean> {
  if (!routingConfigured()) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("property")
    .select("id, address_line1, city, state, postal_code, geocoded_address")
    .eq("id", propertyId)
    .maybeSingle();
  const p = data as
    (Parameters<typeof formatAddress>[0] & { geocoded_address: string | null }) | null;
  if (!p) return false;
  const address = formatAddress(p);
  // Coordinates are kept with the address they belong to, whether looked up, marked at the
  // pool by GPS, or set by hand: only a changed address needs a new lookup.
  if (p.geocoded_address === address) return false;
  const found = await geocodeAddress(supabase, office.company.id, address);
  if (!found) return false;
  const { error } = await supabase
    .from("property")
    .update({
      latitude: found.lat,
      longitude: found.lng,
      geocoded_address: address,
      location_source: "geocoder",
    })
    .eq("id", propertyId);
  return !error;
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
