import {
  ROUTING_DEFAULTS,
  START_FROM_COPY,
  backLegLabel,
  dayMapPins,
  decodePins,
  encodePins,
  homeLookupAddress,
  homeMapStatus,
  moveJobChange,
  planDay,
  planWeek,
  routeStart,
  startFor,
  startLegLabel,
  suggestServiceDays,
  suggestSlots,
  suggestTimes,
  timeRoute,
  zonedMinutesToIso,
  type LatLng,
  type MapPin,
  type MemberStart,
  type MoveInput,
  type PlanContext,
  type PlanJob,
  type RouteStartLabel,
  type RouteStop,
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

/** Tuesday 2026-10-20, 8:00 AM in Phoenix. */
const CTX: PlanContext = {
  timeZone: "America/Phoenix",
  settings: ROUTING_DEFAULTS,
  depot: SHOP,
  today: "2026-10-20",
  nowMin: 480,
};
const HOME_CTX: PlanContext = { ...CTX, starts: STARTS };

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
    ],
  ),
  startLegLabel: rule((l: RouteStartLabel) => startLegLabel(l), [["shop"], ["home"]]),
  backLegLabel: rule((l: RouteStartLabel) => backLegLabel(l), [["shop"], ["home"]]),

  timeRoute: rule(
    (stops: RouteStop[], depot: LatLng | null, known?: Known) =>
      timeRoute(stops, depot, DAY, driveOf(known)),
    [
      [[stop("n", NORTH), stop("near", NEAR)], startFor("t1", STARTS, SHOP).at],
      [[stop("n", NORTH), stop("near", NEAR)], startFor("t2", STARTS, SHOP).at],
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
    ],
  ),
  moveJobChange: rule(
    (c: PlanContext, input: MoveInput, known?: Known) => moveJobChange(c, input, driveOf(known)),
    [
      [CTX, move({ job: planJob("x", { property: at(NORTH) }) })],
      [HOME_CTX, move({ job: planJob("x", { property: at(NORTH) }) })],
      [HOME_CTX, move({ job: planJob("x", { property: at(NORTH) }), tech: "t2" })],
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
      ...[CTX, HOME_CTX].map(
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
    ],
  ),
  suggestServiceDays: rule(
    (input: ServiceDaysInput, known?: Known) =>
      suggestServiceDays({ ...input, drive: driveOf(known) }),
    [
      // A north pool: the first tech when both start at the shop, the one living north otherwise.
      ...[null, [start({ user_id: "t2" })]].map((starts): [ServiceDaysInput] => [
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
