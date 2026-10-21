import {
  ARRIVAL_WINDOWS,
  JOB_LOCK_HELP,
  JOB_LOCK_LABELS,
  JOB_LOCKS,
  LOCK_LABELS,
  NOT_ON_MAP,
  mapStatus,
  ROUTING_DEFAULTS,
  arrivalText,
  arrivalWindow,
  canMoveJob,
  canUnschedule,
  clockToMinutes,
  dayDirections,
  daySummary,
  durationLabel,
  estimateDriveMinutes,
  haversineMeters,
  inRouteOrder,
  jobLock,
  jobMinutes,
  localMinutes,
  lockColumns,
  lockReason,
  mapsLinks,
  minutesLabel,
  minutesToClock,
  onMyWayText,
  optimizeRoute,
  pointKey,
  routeCost,
  routeLink,
  routeUpdates,
  routingSettings,
  stopFor,
  suggestSlots,
  timeRoute,
  weekday,
  workDay,
  zonedMinutesToIso,
  type DriveFn,
  type JobLock,
  type LatLng,
  type MapPlace,
  type MapsApp,
  type PlanJob,
  type PlannedStop,
  type RouteStop,
  type RoutingSettings,
  type SavedStop,
  type TechDay,
  type TimedRoute,
  type WorkDay,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// Drive times as the phone has them: known times between point keys ("from>to"), else the
// built-in estimate (DriveTimes in Sources/SundeckCore/Routing.swift).
export type Known = Record<string, number>;
export const driveOf =
  (known: Known = {}): DriveFn =>
  (a, b) =>
    !a || !b ? 0 : (known[`${pointKey(a)}>${pointKey(b)}`] ?? estimateDriveMinutes(a, b));

// Around Phoenix.
export const SHOP: LatLng = { lat: 33.4152, lng: -111.8315 };
export const NEAR: LatLng = { lat: 33.4252, lng: -111.8315 };
export const FAR: LatLng = { lat: 33.6152, lng: -111.8315 };
export const EAST: LatLng = { lat: 33.4152, lng: -111.6315 };
export const WEST: LatLng = { lat: 33.45, lng: -112.07 };
export const NORTH: LatLng = { lat: 33.7, lng: -112.0 };
export const SOUTH: LatLng = { lat: 33.3, lng: -111.9 };
export const POINTS = [NEAR, FAR, EAST, WEST, NORTH, SOUTH, { lat: 33.5, lng: -111.75 }];

const DAY: WorkDay = { startMin: 480, endMin: 1020 };
const SHORT_DAY: WorkDay = { startMin: 480, endMin: 600 };

const stop = (
  id: string,
  location: LatLng | null,
  durationMin = 60,
  o: Partial<RouteStop> = {},
) => ({
  id,
  location,
  durationMin,
  ...o,
});

/** Ten stops: past the exact search, so the nearest-first and swap heuristic runs. */
const TEN: RouteStop[] = [
  ...POINTS.map((p, i) => stop(`s${i}`, p, 45)),
  stop("s7", { lat: 33.62, lng: -111.9 }, 30),
  stop("s8", null, 30),
  stop("s9", { lat: 33.35, lng: -111.8 }, 30, { fixedStartMin: 600 }),
];

export const planJob = (id: string, o: Partial<PlanJob> = {}): PlanJob => ({
  id,
  status: "scheduled",
  assigned_user_id: "t1",
  second_tech_id: null,
  scheduled_start: null,
  scheduled_end: null,
  route_order: null,
  arrival_fixed: false,
  property: null,
  ...o,
});
const at = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

const settings = (o: Partial<RoutingSettings> = {}): RoutingSettings => ({
  ...ROUTING_DEFAULTS,
  ...o,
});

// routing.ts and route-plan.ts.
export const routing: ModuleCases = {
  // "Not found on the map" (owner, 2026-10-20).
  NOT_ON_MAP: rule(() => NOT_ON_MAP, [[]]),
  mapStatus: rule(
    (p: Parameters<typeof mapStatus>[0], routing: boolean) => mapStatus(p, routing),
    [
      [null, true],
      [{ address_line1: "1 Main St", city: "Mesa", state: "AZ", postal_code: "85201" }, true],
      [{ address_line1: "1 Main St", city: "Mesa", state: "AZ", postal_code: "85201" }, false],
      [
        {
          address_line1: "1 Main St",
          city: "Mesa",
          state: "AZ",
          postal_code: "85201",
          latitude: 33.4,
          longitude: -111.8,
        },
        true,
      ],
      [
        {
          address_line1: "1 Main St",
          city: "Mesa",
          state: "AZ",
          postal_code: "85201",
          latitude: 33.4,
          longitude: -111.8,
        },
        false,
      ],
      [
        {
          address_line1: "1 Main St",
          city: "Mesa",
          state: "AZ",
          postal_code: "85201",
          latitude: 33.4,
          longitude: -111.8,
          geocoded_address: "1 Main St, Mesa, AZ 85201",
        },
        true,
      ],
      [
        {
          address_line1: "1 Main St",
          city: "Mesa",
          state: "AZ",
          postal_code: "85201",
          latitude: 33.4,
          longitude: -111.8,
          geocoded_address: "9 Old Rd, Mesa, AZ 85201",
        },
        true,
      ],
      [
        {
          address_line1: "1 Main St",
          city: null,
          state: null,
          postal_code: null,
          latitude: 0,
          longitude: 0,
        },
        true,
      ],
      [{ address_line1: "1 Main St", latitude: 33.4, longitude: null }, true],
      [{ address_line1: "", city: "Mesa", state: "AZ", postal_code: "85201" }, true],
      [{ address_line1: "   ", city: "Mesa", latitude: 33.4, longitude: -111.8 }, true],
      [
        {
          address_line1: "1 Main St",
          city: "Mesa",
          state: "AZ",
          postal_code: "85201",
          geocoded_address: "1 Main St, Mesa, AZ 85201",
        },
        true,
      ],
    ],
  ),
  haversineMeters: rule(
    (a: LatLng, b: LatLng) => haversineMeters(a, b),
    [
      [SHOP, NEAR],
      [SHOP, FAR],
      [SHOP, SHOP],
      [WEST, NORTH],
      [
        { lat: 0, lng: 179.9 },
        { lat: 0, lng: -179.9 },
      ],
    ],
  ),
  estimateDriveMinutes: rule(
    (a: LatLng | null, b: LatLng | null) => estimateDriveMinutes(a, b),
    [
      [null, SHOP],
      [SHOP, null],
      [null, null],
      [SHOP, SHOP],
      // Under 50 m by road.
      [SHOP, { lat: 33.4154, lng: -111.8315 }],
      [SHOP, NEAR],
      [SHOP, FAR],
      [SHOP, EAST],
      [WEST, NORTH],
      [SOUTH, NORTH],
      [
        { lat: 33.4, lng: -112 },
        { lat: 34.5, lng: -111.5 },
      ],
    ],
  ),
  pointKey: rule(
    (p: LatLng) => pointKey(p),
    [
      [SHOP],
      [{ lat: 33.41523, lng: -111.83149 }],
      // Exact ties: toFixed rounds up, C's printf to even.
      [{ lat: 0.03125, lng: -0.03125 }],
      [{ lat: 1.00005, lng: 2.5 }],
      [{ lat: 0, lng: -0 }],
      [{ lat: -0.00001, lng: 1e-7 }],
      [{ lat: 89.99999, lng: -179.99995 }],
    ],
  ),
  timeRoute: rule(
    (stops: RouteStop[], depot: LatLng | null, day: WorkDay, known?: Known) =>
      timeRoute(stops, depot, day, driveOf(known)),
    [
      [[], SHOP, DAY],
      [[], null, DAY],
      [[stop("far", FAR), stop("near", NEAR)], SHOP, DAY],
      [[stop("near", NEAR), stop("far", FAR)], SHOP, DAY],
      // No locations: no driving, flagged.
      [[stop("a", null), stop("b", NEAR), stop("c", null, 30)], SHOP, DAY],
      [[stop("a", NEAR)], null, DAY],
      // A fixed time met early (waits), and one missed (late).
      [
        [stop("a", NEAR, 60, { fixedStartMin: 600 }), stop("b", FAR, 90, { fixedStartMin: 690 })],
        SHOP,
        DAY,
      ],
      // Not before now.
      [
        [stop("a", NEAR, 60, { earliestMin: 700 }), stop("b", EAST, 60, { earliestMin: 0 })],
        SHOP,
        DAY,
      ],
      // Overtime.
      [[stop("a", FAR, 120), stop("b", NORTH, 120)], SHOP, SHORT_DAY],
      // Known drive times win over the estimate.
      [
        [stop("a", NEAR), stop("b", FAR)],
        SHOP,
        DAY,
        { [`${pointKey(SHOP)}>${pointKey(NEAR)}`]: 17, [`${pointKey(FAR)}>${pointKey(SHOP)}`]: 2 },
      ],
    ],
  ),
  routeCost: rule(
    (r: TimedRoute) => routeCost(r),
    [
      [{ stops: [], driveMin: 0, backMin: 480, overtimeMin: 0, lateMin: 0 }],
      [{ stops: [], driveMin: 42, backMin: 1100, overtimeMin: 80, lateMin: 7 }],
    ],
  ),
  optimizeRoute: rule(
    (stops: RouteStop[], depot: LatLng | null, day: WorkDay, known?: Known) =>
      optimizeRoute(stops, depot, day, driveOf(known)),
    [
      [[], SHOP, DAY],
      [[stop("a", NEAR)], SHOP, DAY],
      // Either order drives the same loop: ties keep the current order.
      [[stop("far", FAR), stop("near", NEAR)], SHOP, DAY],
      // A fixed 8:00 appointment far away goes first.
      [[stop("near", NEAR), stop("far", FAR, 60, { fixedStartMin: 480 })], SHOP, DAY],
      [POINTS.slice(0, 5).map((p, i) => stop(`p${i}`, p, 50)), SHOP, DAY],
      // Eight stops: the most the exact search takes.
      [[...POINTS.map((p, i) => stop(`p${i}`, p, 40)), stop("x", null, 20)], SHOP, DAY],
      // Nine and ten: nearest first, then swaps.
      [TEN.slice(0, 9), SHOP, DAY],
      [TEN, SHOP, DAY],
      [TEN, null, SHORT_DAY],
      // One-way streets: a table that isn't symmetric.
      [
        [stop("a", NEAR), stop("b", FAR), stop("c", EAST)],
        SHOP,
        DAY,
        {
          [`${pointKey(SHOP)}>${pointKey(NEAR)}`]: 40,
          [`${pointKey(NEAR)}>${pointKey(SHOP)}`]: 1,
          [`${pointKey(EAST)}>${pointKey(NEAR)}`]: 1,
        },
      ],
    ],
  ),
  suggestSlots: rule(
    (
      job: { location: LatLng | null; durationMin: number },
      days: TechDay[],
      depot: LatLng | null,
      day: WorkDay,
      known?: Known | null,
      limit?: number,
    ) => suggestSlots(job, days, depot, day, driveOf(known ?? {}), limit),
    [
      [{ location: NEAR, durationMin: 60 }, [], SHOP, DAY],
      [
        { location: NEAR, durationMin: 60 },
        [
          {
            date: "2026-10-20",
            techId: "t1",
            techName: "Tony",
            stops: [stop("a", NEAR, 60, { fixedStartMin: 540 })],
            labels: { a: "Grace Holloway" },
          },
          { date: "2026-10-21", techId: "t1", techName: "Tony", stops: [] },
        ],
        SHOP,
        DAY,
      ],
      // Sooner days win small ties; labels missing; today's route starts after now.
      [
        { location: EAST, durationMin: 90 },
        [
          { date: "2026-10-23", techId: "t2", techName: "Sam", stops: [stop("b", EAST, 60)] },
          {
            date: "2026-10-20",
            techId: "t1",
            techName: "Tony",
            stops: [stop("a", NEAR, 60), stop("c", FAR, 60)],
            labels: { a: "Riley" },
            notBeforeMin: 720,
          },
          {
            date: "2026-10-20",
            techId: "t2",
            techName: "Sam",
            stops: [stop("d", WEST, 60, { fixedStartMin: 600 })],
          },
        ],
        SHOP,
        DAY,
      ],
      // A full day can't take it; the job has no location; a limit of 1.
      [
        { location: null, durationMin: 240 },
        [
          {
            date: "2026-10-22",
            techId: "t1",
            techName: "Tony",
            stops: [stop("a", FAR, 400, { fixedStartMin: 480 })],
          },
          { date: "2026-10-22", techId: "t2", techName: "Sam", stops: [] },
          { date: "2026-10-21", techId: "t3", techName: "Ana", stops: [] },
        ],
        SHOP,
        SHORT_DAY,
        null,
        1,
      ],
      // Same score and date: the earlier start, then the order given.
      [
        { location: SHOP, durationMin: 30 },
        [
          { date: "2026-10-21", techId: "t1", techName: "Tony", stops: [stop("a", null, 60)] },
          { date: "2026-10-21", techId: "t2", techName: "Sam", stops: [] },
          { date: "2026-10-21", techId: "t3", techName: "Ana", stops: [] },
        ],
        SHOP,
        DAY,
      ],
    ],
  ),

  // Times and words
  clockToMinutes: rule(
    (s: string) => clockToMinutes(s),
    [["08:30"], ["00:00"], ["23:59"], ["17:15"], ["9"], ["07:5"], [""], ["12:00:30"], ["8:"]],
  ),
  minutesToClock: rule(
    (m: number) => minutesToClock(m),
    [[510], [0], [-30], [1439], [1440], [1500], [59]],
  ),
  minutesLabel: rule(
    (m: number) => minutesLabel(m),
    [[510], [0], [-5], [719], [720], [780], [1439], [1500]],
  ),
  durationLabel: rule(
    (m: number) => durationLabel(m),
    [[0], [-3], [25], [59], [60], [65], [120], [605]],
  ),
  arrivalWindow: rule(
    (start: number, window: number) => arrivalWindow(start, window),
    [
      [612, 0],
      [612, 60],
      [600, 120],
      [629, 240],
      [630, 60],
    ],
  ),
  arrivalText: rule(
    (start: number, window: number) => arrivalText(start, window),
    [
      [612, 0],
      [612, 60],
      [690, 120],
      [1410, 60],
    ],
  ),
  onMyWayText: rule(
    (input: Parameters<typeof onMyWayText>[0]) => onMyWayText(input),
    [
      [{ customer: "Riley Rivera", tech: "Tony Tech", shop: "Desert Leak Co.", arriveMin: 642 }],
      [{ customer: null, tech: "Tony", shop: "Desert Leak", arriveMin: 600, windowMin: 120 }],
      [{ customer: "Grace", tech: "Dana Lee", shop: "Pools Inc", arriveMin: 645, windowMin: 0 }],
      // An empty name reads as none; a name that starts with a space has an empty first word.
      [{ customer: "", tech: "Dana", shop: "Shop..", arriveMin: 601 }],
      [{ customer: " Riley", tech: " Dana", shop: "Shop", arriveMin: 719, windowMin: 60 }],
    ],
  ),

  // Maps
  mapsLinks: rule(
    (p: MapPlace) => mapsLinks(p),
    [[{ address: "1423 Palm Ct, Mesa, AZ", location: NEAR }], [{ address: "88 Desert Willow Dr" }]],
  ),
  routeLink: rule(
    (origin: MapPlace | null, stops: MapPlace[]) => routeLink(origin, stops),
    [
      [null, []],
      [{ address: "Shop", location: SHOP }, []],
      [
        { address: "Shop", location: SHOP },
        [{ address: "1423 Palm Ct, Mesa, AZ", location: NEAR }],
      ],
      // Addresses as text: spaces become +, and | , # & are escaped.
      [null, [{ address: "1 Shop Way, Mesa" }, { address: "Café #5 & Co. ~'!*()" }]],
      [
        { address: "1 Shop Way" },
        Array.from({ length: 12 }, (_, i) => ({ address: `${i + 1} Palm Ct` })),
      ],
    ],
  ),
  dayDirections: rule(
    (app: MapsApp, origin: MapPlace | null, stops: (MapPlace & { done?: boolean })[]) =>
      dayDirections(app, origin, stops),
    [
      ["google", null, []],
      ["apple", null, []],
      [
        "google",
        { address: "Shop", location: SHOP },
        [{ address: "1 Palm Ct", location: NEAR, done: true }, { address: "2 Palm Ct" }],
      ],
      [
        "apple",
        { address: "Shop", location: SHOP },
        [
          { address: "1 Palm Ct", location: NEAR, done: true },
          { address: "2 Palm Ct", done: false },
        ],
      ],
      ["apple", null, [{ address: "1 Palm Ct", done: true }]],
    ],
  ),

  // route-plan.ts
  ROUTING_DEFAULTS: rule(() => ROUTING_DEFAULTS, [[]]),
  ARRIVAL_WINDOWS: rule(() => ARRIVAL_WINDOWS, [[]]),
  routingSettings: rule(
    (s: unknown) => routingSettings(s),
    [
      [null],
      [{}],
      [{ routing: null }],
      [{ routing: "x" }],
      [
        {
          routing: {
            day_start: "07:30",
            day_end: "06:00",
            arrival_window_minutes: 60,
            job_minutes: 90,
            work_days: [6, 1, 1, 9],
          },
        },
      ],
      // Numbers as text count (Number("120")); a one-item list too; bad clocks are ignored.
      [
        {
          routing: {
            day_start: "7:30",
            day_end: "24:00",
            arrival_window_minutes: "120",
            job_minutes: ["45"],
            work_days: [0, "1", 2.5, -1, 3],
          },
        },
      ],
      [
        {
          routing: {
            day_start: "09:00",
            day_end: "21:30",
            arrival_window_minutes: 90,
            job_minutes: 14,
            work_days: [],
          },
        },
      ],
      [{ routing: { arrival_window_minutes: true, job_minutes: 720.5, work_days: "1,2" } }],
      [{ routing: { arrival_window_minutes: [240], job_minutes: 720, work_days: [5, 0, 6] } }],
      [{ routing: { arrival_window_minutes: null, job_minutes: "15", day_end: "08:00" } }],
    ],
  ),
  workDay: rule(
    (s: RoutingSettings) => workDay(s),
    [[settings()], [settings({ dayStart: "06:45", dayEnd: "15:15" })]],
  ),
  weekday: rule(
    (d: string) => weekday(d),
    [["2026-10-18"], ["2026-10-19"], ["2026-10-24"], ["2024-02-29"], ["1999-12-31"], ["not a day"]],
  ),
  localMinutes: rule(
    (iso: string, tz: string) => localMinutes(iso, tz),
    [
      ["2026-10-12T16:00:00Z", "America/Phoenix"],
      ["2026-10-12T16:00:59.999Z", "America/Phoenix"],
      ["2026-10-12 16:30:00+00", "America/Phoenix"],
      ["2026-10-12T06:59:00Z", "America/Phoenix"],
      // Either side of the clocks changing in New York.
      ["2026-03-08T06:59:00Z", "America/New_York"],
      ["2026-03-08T07:00:00Z", "America/New_York"],
      ["2026-11-01T05:30:00Z", "America/New_York"],
      ["2026-11-01T06:30:00Z", "America/New_York"],
      ["2026-10-12T16:00:00+05:30", "UTC"],
      ["2026-10-12T16:00:00Z", "Mars/Olympus"],
      ["soon", "UTC"],
    ],
  ),
  LOCK_LABELS: rule(() => LOCK_LABELS, [[]]),
  canMoveJob: rule(
    (s: string) => canMoveJob(s),
    ["unscheduled", "scheduled", "in_progress", "done", "paid", "canceled"].map((s) => [s]),
  ),
  canUnschedule: rule(
    (s: string) => canUnschedule(s),
    ["unscheduled", "scheduled", "in_progress", "done", "paid", "canceled"].map((s) => [s]),
  ),
  lockReason: rule(
    (j: PlanJob) => lockReason(j),
    [
      [planJob("a")],
      [planJob("a", { status: "unscheduled" })],
      [planJob("a", { status: "in_progress", arrival_fixed: true })],
      [planJob("a", { status: "report_sent" })],
      [planJob("a", { arrival_fixed: true, second_tech_id: "t2" })],
      [planJob("a", { second_tech_id: "t2" })],
      [planJob("a", { second_tech_id: "" })],
      // Locks: a day lock alone isn't a reason; a time lock is; both is "fixed".
      [planJob("a", { lock_day: true })],
      [planJob("a", { lock_day: true, second_tech_id: "t2" })],
      [planJob("a", { lock_time: true, second_tech_id: "t2" })],
      [planJob("a", { status: "unscheduled", lock_day: true, lock_time: true })],
      [planJob("a", { status: "done", lock_time: true })],
    ],
  ),
  JOB_LOCKS: rule(() => JOB_LOCKS, [[]]),
  JOB_LOCK_LABELS: rule(() => JOB_LOCK_LABELS, [[]]),
  JOB_LOCK_HELP: rule(() => JOB_LOCK_HELP, [[]]),
  jobLock: rule(
    (j: Parameters<typeof jobLock>[0]) => jobLock(j),
    [
      [{}],
      [{ lock_day: true }],
      [{ lock_time: true }],
      [{ lock_day: true, lock_time: true }],
      [{ arrival_fixed: true }],
      [{ arrival_fixed: true, lock_day: false, lock_time: false }],
      [{ arrival_fixed: false, lock_day: true }],
      [{ arrival_fixed: true, lock_time: true }],
    ],
  ),
  lockColumns: rule(
    (l: JobLock) => lockColumns(l),
    (["none", "day", "time", "both"] as JobLock[]).map((l) => [l]),
  ),
  inRouteOrder: rule(
    (jobs: PlanJob[]) => inRouteOrder(jobs).map((j) => j.id),
    [
      [[]],
      [
        [
          planJob("c", { scheduled_start: "2026-10-20T18:00:00Z", route_order: 1 }),
          planJob("a", { scheduled_start: "2026-10-20T16:00:00Z", route_order: 2 }),
          planJob("b"),
        ],
      ],
      // Same time: the saved place, then the id; no time and no place last.
      [
        [
          planJob("e"),
          planJob("d", { route_order: 3 }),
          planJob("b", { scheduled_start: "2026-10-20T16:00:00Z", route_order: 2 }),
          planJob("a", { scheduled_start: "2026-10-20T16:00:00.000Z", route_order: 2 }),
          planJob("c", { scheduled_start: "2026-10-20 16:00:00+00", route_order: 1 }),
          planJob("B"),
          planJob("f", { scheduled_start: "not a time", route_order: 0 }),
        ],
      ],
    ],
  ),
  jobMinutes: rule(
    (j: PlanJob, s: RoutingSettings) => jobMinutes(j, s),
    [
      [planJob("a"), settings()],
      [
        planJob("a", {
          scheduled_start: "2026-10-20T16:00:00Z",
          scheduled_end: "2026-10-20T17:30:00Z",
        }),
        settings(),
      ],
      [
        planJob("a", {
          scheduled_start: "2026-10-20T16:00:00Z",
          scheduled_end: "2026-10-20T16:00:29Z",
        }),
        settings({ jobMinutes: 90 }),
      ],
      [
        planJob("a", {
          scheduled_start: "2026-10-20T16:00:00Z",
          scheduled_end: "2026-10-20T16:00:30Z",
        }),
        settings(),
      ],
      [
        planJob("a", {
          scheduled_start: "2026-10-20T16:00:00Z",
          scheduled_end: "2026-10-21T16:01:00Z",
        }),
        settings({ jobMinutes: 45 }),
      ],
      [
        planJob("a", {
          scheduled_start: "2026-10-20T16:00:00Z",
          scheduled_end: "2026-10-20T15:00:00Z",
        }),
        settings(),
      ],
      [planJob("a", { scheduled_start: "2026-10-20T16:00:00Z" }), settings()],
    ],
  ),
  stopFor: rule(
    (j: PlanJob, ctx: Parameters<typeof stopFor>[1]) => stopFor(j, ctx),
    [
      [
        planJob("a", {
          property: at(NEAR),
          scheduled_start: "2026-10-20T16:00:00Z",
          scheduled_end: "2026-10-20T17:00:00Z",
        }),
        { timeZone: "America/Phoenix", settings: settings(), techId: "t1", nowMin: 540 },
      ],
      [
        planJob("a", {
          property: at(NEAR),
          arrival_fixed: true,
          scheduled_start: "2026-10-20T16:00:00Z",
        }),
        { timeZone: "America/Phoenix", settings: settings(), techId: "t2", nowMin: 540 },
      ],
      [
        planJob("a", { status: "in_progress", property: { latitude: 33.4, longitude: null } }),
        { timeZone: "America/Phoenix", settings: settings({ jobMinutes: 75 }), techId: "t1" },
      ],
      [
        planJob("a", { second_tech_id: "t2", scheduled_start: "2026-11-01T06:30:00Z" }),
        { timeZone: "America/New_York", settings: settings(), techId: "t2", nowMin: null },
      ],
      // A time lock keeps its time; a day lock alone may move.
      [
        planJob("a", {
          property: at(NEAR),
          lock_time: true,
          scheduled_start: "2026-10-20T16:00:00Z",
        }),
        { timeZone: "America/Phoenix", settings: settings(), techId: "t1", nowMin: 540 },
      ],
      [
        planJob("a", {
          property: at(NEAR),
          lock_day: true,
          scheduled_start: "2026-10-20T16:00:00Z",
        }),
        { timeZone: "America/Phoenix", settings: settings(), techId: "t1", nowMin: 540 },
      ],
    ],
  ),
  zonedMinutesToIso: rule(
    (date: string, min: number, tz: string) => zonedMinutesToIso(date, min, tz),
    [
      ["2026-10-20", 540, "America/Phoenix"],
      ["2026-10-20", -30, "America/Phoenix"],
      ["2026-10-20", 1500, "America/Phoenix"],
      // 2:30 AM doesn't exist on the spring-forward day; 1:30 AM happens twice in the fall.
      ["2026-03-08", 150, "America/New_York"],
      ["2026-03-08", 180, "America/New_York"],
      ["2026-11-01", 90, "America/New_York"],
      ["2026-11-01", 480, "America/New_York"],
      ["2026-10-20", 540, "Europe/London"],
      ["2026-10-20", 540, "Nowhere/Land"],
    ],
  ),
  routeUpdates: rule(
    (date: string, tz: string, stops: PlannedStop[], known?: Known) =>
      routeUpdates(date, tz, stops, timeRoute(stops, SHOP, DAY, driveOf(known))),
    [
      ["2026-10-20", "America/Phoenix", []],
      [
        "2026-10-20",
        "America/Phoenix",
        [
          { ...stop("a", NEAR, 60), movable: true, own: true },
          { ...stop("b", FAR, 90, { fixedStartMin: 660 }), movable: false, own: true },
          { ...stop("c", EAST, 45), movable: true, own: false },
          { ...stop("d", null, 1000), movable: true, own: true },
        ],
      ],
      [
        "2026-11-01",
        "America/New_York",
        [{ ...stop("a", NEAR, 60, { earliestMin: 60 }), movable: true, own: true }],
      ],
    ],
  ),
  daySummary: rule(
    (stops: SavedStop[], depot: LatLng | null, day: WorkDay, known?: Known) =>
      daySummary(stops, depot, day, driveOf(known)),
    [
      [[], SHOP, DAY],
      [
        [
          { id: "a", location: NEAR, startMin: 480, endMin: 600 },
          { id: "b", location: FAR, startMin: 610, endMin: 700 },
          { id: "c", location: null, startMin: 720, endMin: 780 },
        ],
        SHOP,
        { startMin: 480, endMin: 750 },
      ],
      // Jobs without times; no shop location.
      [
        [
          { id: "a", location: NEAR, startMin: null, endMin: null },
          { id: "b", location: EAST, startMin: 600, endMin: null },
          { id: "c", location: FAR, startMin: 500, endMin: 560 },
        ],
        null,
        DAY,
      ],
      [[{ id: "a", location: null, startMin: null, endMin: null }], SHOP, DAY],
    ],
  ),
};
