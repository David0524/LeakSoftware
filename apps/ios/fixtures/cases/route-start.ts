import {
  ROUTING_DEFAULTS,
  START_FROM_COPY,
  backLegLabel,
  dayMapPins,
  daySummary,
  decodePins,
  encodePins,
  endAtOf,
  homeLookupAddress,
  homeMapStatus,
  moveJobChange,
  optimizeRoute,
  planDay,
  planWeek,
  routeStart,
  startFor,
  startLegLabel,
  suggestServiceDays,
  suggestSlots,
  suggestTimes,
  timeRoute,
  usesHome,
  zonedMinutesToIso,
  type LatLng,
  type MapPin,
  type MemberStart,
  type MoveInput,
  type PlanContext,
  type PlanJob,
  type RouteStart,
  type RouteStartLabel,
  type RouteStop,
  type SavedStop,
  type SuggestRoute,
  type TechDay,
  type WeekDay,
  type WeekJob,
  type WorkDay,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";
import { EAST, NEAR, NORTH, SHOP, SOUTH, WEST, driveOf, planJob, type Known } from "./routing";

// route-start.ts (start the day from home or from the shop, owner 2026-10-21;
// docs/design/2026-10-21-start-from-home.md), and the routing rules that take a tech's start.

const DAY: WorkDay = { startMin: 480, endMin: 1020 };
const HOME: LatLng = { lat: 33.69, lng: -112.0 }; // near NORTH, far from the shop
const at = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

const start = (o: Partial<MemberStart> = {}): MemberStart => ({
  id: "s1",
  company_id: "c1",
  user_id: "t1",
  start_from: "home",
  home_address: "4 Elm St, Phoenix, AZ",
  home_latitude: HOME.lat,
  home_longitude: HOME.lng,
  home_geocoded_address: "4 Elm St, Phoenix, AZ",
  ...o,
});
const STARTS = [start(), start({ id: "s2", user_id: "t2", start_from: "shop" })];
/** Ends apart from starts (owner, 2026-11-23): t1 shop to home, t2 home to the shop. */
const ENDS = [
  start({ start_from: "shop", end_at: "home" }),
  start({ id: "s2", user_id: "t2", start_from: "home", end_at: "shop" }),
];
const SHOP_TO_HOME = startFor("t1", ENDS, SHOP);
const HOME_TO_SHOP = startFor("t2", ENDS, SHOP);

/** Tuesday 2026-10-20, 8:00 AM in Phoenix. */
const CTX: PlanContext = {
  timeZone: "America/Phoenix",
  settings: ROUTING_DEFAULTS,
  depot: SHOP,
  today: "2026-10-20",
  nowMin: 480,
};
const HOME_CTX: PlanContext = { ...CTX, starts: STARTS };
const END_CTX: PlanContext = { ...CTX, starts: ENDS };

const timed = (id: string, p: LatLng | null, i: number, o: Partial<PlanJob> = {}) =>
  planJob(id, {
    property: p ? at(p) : null,
    scheduled_start: zonedMinutesToIso("2026-10-21", 480 + i * 90, "America/Phoenix"),
    scheduled_end: zonedMinutesToIso("2026-10-21", 540 + i * 90, "America/Phoenix"),
    route_order: i + 1,
    ...o,
  });
const DAY_JOBS = [
  timed("east", EAST, 0),
  timed("north", NORTH, 1),
  timed("west", WEST, 2),
  timed("south", SOUTH, 3),
];

const move = (o: Partial<MoveInput> & { job: PlanJob }): MoveInput => ({
  tech: "t1",
  date: "2026-10-21",
  index: 0,
  targetDay: [],
  fromDay: [],
  seesAll: true,
  userId: "t1",
  ...o,
});

const stop = (id: string, location: LatLng | null): RouteStop => ({
  id,
  location,
  durationMin: 60,
});
const weekJob = (id: string, location: LatLng, techs = ["t1"]): WeekJob => ({
  id,
  location,
  durationMin: 60,
  techId: null,
  date: null,
  techs,
});

type ServiceDaysInput = Omit<Parameters<typeof suggestServiceDays>[0], "drive">;

export const routeStartCases: ModuleCases = {
  START_FROM_COPY: rule(() => START_FROM_COPY, [[]]),
  endAtOf: rule(
    (m: Pick<MemberStart, "start_from" | "end_at">) => endAtOf(m),
    [
      [{ start_from: "shop" }],
      [{ start_from: "home" }],
      [{ start_from: "shop", end_at: "home" }],
      [{ start_from: "home", end_at: "shop" }],
      [{ start_from: "home", end_at: "home" }],
    ],
  ),
  usesHome: rule(
    (a: string | null, b: string | null) => usesHome(a, b),
    [
      ["shop", "shop"],
      ["home", "shop"],
      ["shop", "home"],
      ["home", "home"],
      [null, null],
    ],
  ),
  homeLookupAddress: rule(
    (a: string | null) => homeLookupAddress(a),
    [[null], [""], ["  4 Elm St,\n  Phoenix, AZ  "], ["4 Elm St"]],
  ),
  homeMapStatus: rule(
    (m: MemberStart | null) => homeMapStatus(m),
    [
      [null],
      [start()],
      [start({ start_from: "shop" })],
      [start({ home_geocoded_address: null })],
      [start({ home_address: " 4 Elm St,  Phoenix, AZ " })],
      [start({ home_geocoded_address: "1 Old Rd" })],
      [start({ home_latitude: null, home_longitude: null })],
      [start({ home_address: null })],
      [start({ home_address: "  " })],
      [start({ deleted_at: "2026-10-21T00:00:00Z" })],
      [start({ start_from: "shop", end_at: "home" })],
      [start({ start_from: "shop", end_at: "home", home_latitude: null, home_longitude: null })],
      [start({ start_from: "home", end_at: "shop" })],
      [start({ start_from: "shop", end_at: "shop" })],
    ],
  ),
  routeStart: rule(
    (m: MemberStart | null, shop: LatLng | null) => routeStart(m, shop),
    [
      [null, SHOP],
      [null, null],
      [start(), SHOP],
      [start(), null],
      [start({ start_from: "shop" }), SHOP],
      [start({ home_latitude: null, home_longitude: null }), SHOP],
      [start({ home_geocoded_address: "1 Old Rd" }), SHOP],
      [start({ deleted_at: "2026-10-21T00:00:00Z" }), SHOP],
      [start({ start_from: "shop", end_at: "home" }), SHOP],
      [start({ start_from: "home", end_at: "shop" }), SHOP],
      [start({ start_from: "home", end_at: "home" }), SHOP],
      [start({ start_from: "shop", end_at: "home" }), null],
      // Home not on the map: the shop at both ends.
      [
        start({ start_from: "shop", end_at: "home", home_latitude: null, home_longitude: null }),
        SHOP,
      ],
    ],
  ),
  startFor: rule(
    (techId: string | null, starts: MemberStart[] | null, shop: LatLng | null) =>
      startFor(techId, starts, shop),
    [
      ["t1", STARTS, SHOP],
      ["t2", STARTS, SHOP],
      ["t3", STARTS, SHOP],
      [null, STARTS, SHOP],
      ["t1", null, SHOP],
      ["t1", [start({ deleted_at: "2026-10-21T00:00:00Z" })], SHOP],
      ["t1", STARTS, null],
      ["t1", ENDS, SHOP],
      ["t2", ENDS, SHOP],
    ],
  ),
  startLegLabel: rule((l: RouteStartLabel) => startLegLabel(l), [["shop"], ["home"]]),
  backLegLabel: rule((l: RouteStartLabel) => backLegLabel(l), [["shop"], ["home"]]),

  timeRoute: rule(
    (stops: RouteStop[], s: RouteStart, known?: Known) =>
      timeRoute(stops, s.at, DAY, driveOf(known), s.end.at),
    [
      [[stop("n", NORTH), stop("near", NEAR)], startFor("t1", STARTS, SHOP)],
      [[stop("n", NORTH), stop("near", NEAR)], startFor("t2", STARTS, SHOP)],
      [[stop("n", NORTH), stop("near", NEAR)], SHOP_TO_HOME],
      [[stop("n", NORTH), stop("near", NEAR)], HOME_TO_SHOP],
    ],
  ),
  optimizeRoute: rule(
    (stops: RouteStop[], s: RouteStart, known?: Known) =>
      optimizeRoute(stops, s.at, DAY, driveOf(known), s.end.at),
    [
      ...[startFor("t1", STARTS, SHOP), SHOP_TO_HOME, HOME_TO_SHOP].map(
        (s): [RouteStop[], RouteStart] => [
          [stop("n", NORTH), stop("near", NEAR), stop("e", EAST), stop("w", WEST)],
          s,
        ],
      ),
      // More than eight: nearest first, then swaps, to the end.
      [
        [
          stop("n", NORTH),
          stop("near", NEAR),
          stop("e", EAST),
          stop("w", WEST),
          stop("s", SOUTH),
          stop("n2", { lat: 33.68, lng: -112.01 }),
          stop("e2", { lat: 33.42, lng: -111.7 }),
          stop("w2", { lat: 33.47, lng: -112.03 }),
          stop("s2", { lat: 33.32, lng: -111.92 }),
        ],
        SHOP_TO_HOME,
      ],
    ],
  ),
  daySummary: rule(
    (stops: SavedStop[], s: RouteStart, known?: Known) =>
      daySummary(stops, s.at, DAY, driveOf(known), s.end.at),
    [
      ...[startFor("t1", STARTS, SHOP), SHOP_TO_HOME, HOME_TO_SHOP].map(
        (s): [SavedStop[], RouteStart] => [
          [
            { id: "a", location: NEAR, startMin: 480, endMin: 600 },
            { id: "b", location: NORTH, startMin: 660, endMin: 720 },
          ],
          s,
        ],
      ),
      [[], SHOP_TO_HOME],
    ],
  ),
  planDay: rule(
    (c: PlanContext, techId: string, date: string, jobs: PlanJob[], known?: Known) =>
      planDay(c, techId, date, jobs, driveOf(known)),
    [
      [CTX, "t1", "2026-10-21", DAY_JOBS],
      [HOME_CTX, "t1", "2026-10-21", DAY_JOBS],
      // Another tech's home start doesn't change this one's day.
      [HOME_CTX, "t2", "2026-10-21", DAY_JOBS.map((j) => ({ ...j, assigned_user_id: "t2" }))],
      // From home with no shop location: no note about the shop.
      [{ ...HOME_CTX, depot: null }, "t1", "2026-10-21", DAY_JOBS],
      [{ ...HOME_CTX, depot: null }, "t2", "2026-10-21", DAY_JOBS],
      // Ends apart from starts: the day heads toward where it ends.
      [END_CTX, "t1", "2026-10-21", DAY_JOBS],
      [END_CTX, "t2", "2026-10-21", DAY_JOBS.map((j) => ({ ...j, assigned_user_id: "t2" }))],
      // Ending at home with no shop location: the note about the shop.
      [{ ...END_CTX, depot: null }, "t1", "2026-10-21", DAY_JOBS],
    ],
  ),
  moveJobChange: rule(
    (c: PlanContext, input: MoveInput, known?: Known) => moveJobChange(c, input, driveOf(known)),
    [
      [CTX, move({ job: planJob("x", { property: at(NORTH) }) })],
      [HOME_CTX, move({ job: planJob("x", { property: at(NORTH) }) })],
      [HOME_CTX, move({ job: planJob("x", { property: at(NORTH) }), tech: "t2" })],
      [END_CTX, move({ job: planJob("x", { property: at(NORTH) }) })],
      [END_CTX, move({ job: planJob("x", { property: at(NORTH) }), tech: "t2" })],
    ],
  ),
  suggestTimes: rule(
    (
      c: PlanContext,
      job: { id?: string; location: LatLng | null; durationMin: number },
      routes: SuggestRoute[],
      known?: Known,
    ) => suggestTimes(c, job, routes, driveOf(known)),
    [
      ...[CTX, HOME_CTX, END_CTX].map(
        (c) =>
          [
            c,
            { location: NORTH, durationMin: 60 },
            [
              { techId: "t1", techName: "Ana", date: "2026-10-21", jobs: [] },
              { techId: "t2", techName: "Ben", date: "2026-10-21", jobs: [] },
            ],
          ] as [PlanContext, { location: LatLng; durationMin: number }, SuggestRoute[]],
      ),
    ],
  ),
  suggestSlots: rule(
    (job: { location: LatLng | null; durationMin: number }, days: TechDay[], known?: Known) =>
      suggestSlots(job, days, SHOP, DAY, driveOf(known)),
    [
      [
        { location: NORTH, durationMin: 60 },
        [
          { date: "2026-10-21", techId: "t1", techName: "Ana", stops: [], start: HOME },
          { date: "2026-10-21", techId: "t2", techName: "Ben", stops: [] },
          { date: "2026-10-21", techId: "t3", techName: "Cy", stops: [], start: null },
        ],
      ],
      // Ends apart: from the shop to home, from home to the shop, and an end with no location.
      [
        { location: NORTH, durationMin: 60 },
        [
          { date: "2026-10-21", techId: "t1", techName: "Ana", stops: [], start: SHOP, end: HOME },
          {
            date: "2026-10-21",
            techId: "t2",
            techName: "Ben",
            stops: [stop("near", NEAR)],
            start: HOME,
            end: SHOP,
          },
          { date: "2026-10-21", techId: "t3", techName: "Cy", stops: [], end: null },
        ],
      ],
    ],
  ),
  planWeek: rule(
    (days: WeekDay[], jobs: WeekJob[], even?: boolean, known?: Known) =>
      planWeek({ days, jobs, depot: SHOP, day: DAY, drive: driveOf(known), even: !!even }),
    [
      [
        [{ techId: "t1", date: "2026-10-26", stays: [] }],
        [weekJob("e", EAST), weekJob("n", NORTH), weekJob("w", WEST), weekJob("s", SOUTH)],
      ],
      [
        [{ techId: "t1", date: "2026-10-26", stays: [], start: HOME }],
        [weekJob("e", EAST), weekJob("n", NORTH), weekJob("w", WEST), weekJob("s", SOUTH)],
      ],
      // Two techs: the north pools go to the one who lives there; split evenly, one each way.
      ...[false, true].map(
        (even) =>
          [
            [
              { techId: "t1", date: "2026-10-26", stays: [], start: HOME },
              { techId: "t2", date: "2026-10-26", stays: [] },
            ],
            [
              weekJob("n1", NORTH, ["t1", "t2"]),
              weekJob("n2", { lat: 33.68, lng: -112.01 }, ["t1", "t2"]),
              weekJob("s", SOUTH, ["t1", "t2"]),
              weekJob("near", NEAR, ["t1", "t2"]),
            ],
            even,
          ] as [WeekDay[], WeekJob[], boolean],
      ),
      // Stays count from home too.
      [
        [{ techId: "t1", date: "2026-10-26", stays: [stop("kept", NEAR)], start: HOME }],
        [weekJob("n", NORTH)],
      ],
      // Ends apart: the north pools go to the tech who ends at home there, last in the day.
      [
        [
          { techId: "t1", date: "2026-10-26", stays: [], start: SHOP, end: HOME },
          { techId: "t2", date: "2026-10-26", stays: [], start: HOME, end: SHOP },
        ],
        [
          weekJob("n1", NORTH, ["t1", "t2"]),
          weekJob("s", SOUTH, ["t1", "t2"]),
          weekJob("near", NEAR, ["t1", "t2"]),
          weekJob("e", EAST, ["t1", "t2"]),
        ],
        true,
      ],
    ],
  ),
  suggestServiceDays: rule(
    (input: ServiceDaysInput, known?: Known) =>
      suggestServiceDays({ ...input, drive: driveOf(known) }),
    [
      // A north pool: the first tech when both start at the shop, the one living north otherwise.
      ...[
        null,
        [start({ user_id: "t2" })],
        // Only ending there counts too.
        [start({ user_id: "t2", start_from: "shop", end_at: "home" })],
      ].map((starts): [ServiceDaysInput] => [
        {
          place: [{ id: "p1", techId: null, days: [], location: NORTH, durationMin: 60 }],
          keep: [],
          techs: ["t1", "t2"],
          workDays: [1],
          depot: SOUTH,
          starts,
          day: DAY,
        },
      ]),
    ],
  ),
  dayMapPins: rule(
    (input: Parameters<typeof dayMapPins>[0]) => dayMapPins(input),
    [
      [{ stops: [{ id: "a", location: NORTH, done: false }], depot: HOME, startLabel: "home" }],
      [{ stops: [{ id: "a", location: NORTH, done: false }], depot: SHOP, startLabel: "shop" }],
      [{ stops: [], depot: SHOP, startLabel: null }],
      [{ stops: [{ id: "a", location: NORTH, done: true }], depot: null, startLabel: "home" }],
      // Ends apart: both pins, the end last; the same place: one.
      [
        {
          stops: [{ id: "a", location: NORTH, done: false }],
          depot: SHOP,
          startLabel: "shop",
          end: HOME,
          endLabel: "home",
        },
      ],
      [
        {
          stops: [{ id: "a", location: NORTH, done: false }],
          depot: HOME,
          startLabel: "home",
          end: SHOP,
          endLabel: "shop",
        },
      ],
      [{ stops: [], depot: HOME, startLabel: "home", end: HOME, endLabel: "home" }],
      // No start on the map: no end pin either.
      [{ stops: [], depot: null, startLabel: "shop", end: HOME, endLabel: "home" }],
    ],
  ),
  encodePins: rule(
    (pins: MapPin[]) => encodePins(pins),
    [
      [
        [
          { label: "", at: HOME, tone: "shop", id: null, home: true },
          { label: "1", at: NORTH, tone: "todo", id: "a" },
        ],
      ],
      // `home` only marks the start pin.
      [[{ label: "1", at: NORTH, tone: "todo", id: "a", home: true }]],
    ],
  ),
  decodePins: rule(
    (value: string) => decodePins(value),
    [
      ["h:33.69000,-112.00000;t1:33.7,-112"],
      ["s:33.4152,-111.8315;h:33.69,-112"],
      ["h1:33.69,-112"],
      ["H:33.69,-112"],
    ],
  ),
};
