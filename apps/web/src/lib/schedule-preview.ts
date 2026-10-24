import {
  canUnschedule,
  durationLabel,
  estimateDriveMinutes,
  jobLock,
  jobMinutes,
  localDate,
  localMinutes,
  partnerOf,
  planTechDay,
  planWeek,
  planWeekSummary,
  propertyLocation,
  startFor,
  stopFor,
  weekday,
  workDay,
  zonedMinutesToIso,
  type JobChange,
  type LatLng,
  type PartnerDay,
  type PlanContext,
  type PlanJob,
  type PlannedStop,
  type WeekDay,
  type WeekJob,
} from "@leakbook/core";

// Optimize and Optimize Week shown at once (owner, 2026-10-22: "Make Optimize show the new order
// at once, with Undo"; docs/design/2026-10-22-schedule-hold-drag.md). The website's Schedule
// works the new order out in the browser from the jobs on the page, with the built-in drive
// estimate, and shows it while the server plans and saves it (with the shop's real drive times
// when they're set up); the server's answer then confirms or corrects it. The same rules as
// app/actions/routes.ts planRoute and app/actions/week-plan.ts planWeek (and the phones'
// lib/weekPlan.ts). Pure, so it's tested without a browser.

/** A job as the preview reads it: a maintenance visit carries its plan. */
export type PreviewJob = PlanJob & { service_plan_id?: string | null };

/** What the page knows for planning in the browser. */
export type PreviewContext = Omit<PlanContext, "starts"> & {
  /** Each tech whose day starts at home, and where (never the street). */
  homes: { techId: string; at: LatLng }[];
  /**
   * Owners and admins: Optimize may move a shared job when it fits the other tech's day, as
   * the server's planRoute does (owner, 2026-10-24).
   */
  partners?: boolean;
};

const startsOf = (ctx: PreviewContext): PlanContext["starts"] =>
  ctx.homes.map((h) => ({
    user_id: h.techId,
    start_from: "home",
    home_address: "home",
    home_geocoded_address: null,
    home_latitude: h.at.lat,
    home_longitude: h.at.lng,
  }));

/**
 * Optimize worked out in the browser, as the server's planRoute would with the drive estimate:
 * the day's ids in their new order, and the new start of each stop it may re-time. Null when
 * there's nothing to order. `dayOf` gives another tech's day on the page (null when it isn't
 * shown), for shared jobs (planTechDay).
 */
export function previewDay(
  ctx: PreviewContext,
  techId: string,
  date: string,
  jobs: PreviewJob[],
  dayOf: (techId: string) => PreviewJob[] | null = () => null,
): { order: string[]; starts: Record<string, string> } | null {
  if (date < ctx.today || jobs.length < 2) return null;
  const partners: PartnerDay[] = [];
  if (ctx.partners)
    for (const t of new Set(jobs.map((j) => partnerOf(j, techId)))) {
      const day = t && t !== techId ? dayOf(t) : null;
      if (t && day) partners.push({ techId: t, jobs: day });
    }
  const plan = planTechDay(
    { ...ctx, starts: startsOf(ctx) },
    techId,
    date,
    jobs,
    estimateDriveMinutes,
    partners,
  );
  const starts: Record<string, string> = {};
  plan.order.forEach((i, at) => {
    const s = plan.stops[i]!;
    if (s.movable && (s.own || plan.freed.includes(s.id)))
      starts[s.id] = zonedMinutesToIso(date, plan.route.stops[at]!.startMin, ctx.timeZone);
  });
  return { order: plan.order.map((i) => plan.stops[i]!.id), starts };
}

/**
 * Optimize Week worked out in the browser: the rows it would change (the server's planWeek,
 * with the drive estimate). Empty when nothing would move.
 */
export function previewWeek(input: {
  ctx: PreviewContext;
  dates: string[];
  /** Tech ids, or "all" for every tech in `team`. */
  techs: string[] | "all";
  tray: boolean;
  /** The active techs, in the page's order. */
  team: string[];
  /** A tech's day in route order (their own jobs and those they're second tech on). */
  dayJobs: (techId: string, date: string) => PreviewJob[];
  /** Needs a Time. */
  waiting: PreviewJob[];
}): { updates: JobChange[]; message?: string } {
  const { ctx, tray } = input;
  const settings = ctx.settings;
  const dates = [...new Set(input.dates)]
    .filter((d) => d >= ctx.today && settings.workDays.includes(weekday(d)))
    .sort();
  const techs =
    input.techs === "all" || input.techs.includes("all")
      ? input.team
      : input.team.filter((id) => input.techs.includes(id));
  if (!dates.length || !techs.length) return { updates: [] };
  const several = techs.length > 1;
  const starts = startsOf(ctx);

  const days: WeekDay[] = [];
  const stays = new Map<string, PlannedStop>();
  const jobs: WeekJob[] = [];
  const durations = new Map<string, number>();
  for (const techId of techs) {
    for (const date of dates) {
      const here: WeekDay = {
        techId,
        date,
        stays: [],
        earliestMin: date === ctx.today ? ctx.nowMin : null,
        start: startFor(techId, starts, ctx.depot).at,
      };
      for (const j of input.dayJobs(techId, date)) {
        const own = j.assigned_user_id === techId;
        const lock = jobLock(j);
        const movesDay =
          own &&
          canUnschedule(j.status) &&
          !j.second_tech_id &&
          !j.service_plan_id &&
          lock !== "day" &&
          lock !== "both" &&
          !!propertyLocation(j.property);
        if (movesDay) {
          durations.set(j.id, jobMinutes(j, settings));
          jobs.push({
            id: j.id,
            location: propertyLocation(j.property),
            durationMin: jobMinutes(j, settings),
            timeMin:
              lock === "time" && j.scheduled_start
                ? localMinutes(j.scheduled_start, ctx.timeZone)
                : null,
            techId,
            date,
            techs: several ? [techId] : techs,
          });
          continue;
        }
        const stop = stopFor(j, {
          timeZone: ctx.timeZone,
          settings,
          techId,
          nowMin: here.earliestMin,
        });
        stays.set(`${techId}|${j.id}`, stop);
        here.stays.push(stop);
      }
      days.push(here);
    }
  }
  for (const j of input.waiting) {
    if (j.assigned_user_id ? !techs.includes(j.assigned_user_id) : !tray) continue;
    const date = j.scheduled_start ? localDate(new Date(j.scheduled_start), ctx.timeZone) : null;
    if (date && !dates.includes(date)) continue;
    if (!canUnschedule(j.status) || j.second_tech_id || !propertyLocation(j.property)) continue;
    const lock = jobLock(j);
    durations.set(j.id, jobMinutes(j, settings));
    jobs.push({
      id: j.id,
      location: propertyLocation(j.property),
      durationMin: jobMinutes(j, settings),
      timeMin:
        (lock === "time" || lock === "both") && j.scheduled_start
          ? localMinutes(j.scheduled_start, ctx.timeZone)
          : null,
      techId: null,
      date: null,
      techs: j.assigned_user_id ? [j.assigned_user_id] : techs,
    });
  }
  if (!jobs.length) return { updates: [] };
  jobs.sort(
    (a, b) => (a.date ? 0 : 1) - (b.date ? 0 : 1) || (a.date ? 0 : a.id.localeCompare(b.id)),
  );
  const plan = planWeek({
    days,
    jobs,
    depot: ctx.depot,
    day: workDay(settings),
    drive: estimateDriveMinutes,
    even: several,
  });
  const moving = new Set(jobs.map((j) => j.id));
  const updates: JobChange[] = [];
  for (const d of plan.days) {
    d.stops.forEach((s, i) => {
      const t = d.route.stops[i]!;
      const stay = stays.get(`${d.techId}|${s.id}`);
      if (stay && !stay.own) return;
      const row: JobChange = { id: s.id, route_order: i + 1 };
      const retime = moving.has(s.id) ? s.fixedStartMin == null : !!stay?.movable;
      const startMin = retime ? t.startMin : moving.has(s.id) ? s.fixedStartMin : null;
      if (startMin != null) {
        const start = zonedMinutesToIso(d.date, startMin, ctx.timeZone);
        row.scheduled_start = start;
        row.scheduled_end = new Date(
          Date.parse(start) + (durations.get(s.id) ?? s.durationMin) * 60_000,
        ).toISOString();
      }
      if (moving.has(s.id)) {
        row.assigned_user_id = d.techId;
        row.status = "scheduled";
      }
      updates.push(row);
    });
  }
  return { updates, message: planWeekSummary(plan, durationLabel) };
}

/** Where a stop sits on the board: "techId|date", or Needs a Time. */
export interface Placed {
  id: string;
  /** "techId|date", or `tray` for Needs a Time. */
  key: string;
  /** Its tech and date now (a Needs a Time job's booked ones, if any). */
  tech: string | null;
  date: string | null;
}

/**
 * The board's lists after `changes` (rows as the server saves them: a new place in the route,
 * a new time, a new tech): each list's ids in their new order. A row's new time moves it to
 * that day; no tech or no time puts it in Needs a Time (`tray`); a list the board doesn't show
 * keeps it where it is. Stops without a row keep their places, ties keeping the old order.
 */
export function relayout(
  lists: Record<string, Placed[]>,
  changes: readonly JobChange[],
  timeZone: string,
  tray: string,
): Record<string, string[]> | null {
  const byId = new Map(changes.map((c) => [c.id, c]));
  let touched = false;
  const next = new Map<string, { id: string; order: number; was: number }[]>();
  for (const key of Object.keys(lists)) next.set(key, []);
  for (const [key, list] of Object.entries(lists)) {
    list.forEach((s, i) => {
      const c = byId.get(s.id);
      let to = key;
      let order = i + 1;
      if (c) {
        touched = true;
        const tech = "assigned_user_id" in c ? (c.assigned_user_id ?? null) : s.tech;
        const date =
          "scheduled_start" in c
            ? c.scheduled_start
              ? localDate(new Date(c.scheduled_start), timeZone)
              : null
            : s.date;
        const want = !tech || !date ? tray : `${tech}|${date}`;
        if (next.has(want)) to = want;
        if (c.route_order != null) order = c.route_order;
      }
      next.get(to)!.push({ id: s.id, order, was: i });
    });
  }
  if (!touched) return null;
  const out: Record<string, string[]> = {};
  for (const [key, list] of next)
    out[key] = list.sort((a, b) => a.order - b.order || a.was - b.was).map((x) => x.id);
  return out;
}
