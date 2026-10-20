import {
  ROUTING_DEFAULTS,
  addDays,
  addMonths,
  formatDay,
  formatTime,
  isDateString,
  monthGrid,
  moveJobChange,
  planDay,
  renumberDay,
  scheduleDays,
  suggestTimes,
  suggestionDates,
  timeline,
  type AuditEntry,
  type LatLng,
  type MoveInput,
  type PlanContext,
  type PlanJob,
  type ScheduleView,
  type SuggestRoute,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";
import { EAST, FAR, NEAR, NORTH, SHOP, WEST, driveOf, planJob, type Known } from "./routing";

const audit = (
  table_name: string,
  row_id: string,
  field: string | null,
  old_value: unknown,
  new_value: unknown,
  created_at: string,
  user_id: string | null = "u1",
): AuditEntry => ({ user_id, table_name, row_id, field, old_value, new_value, created_at });

const at = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

/** Tuesday 2026-10-20, 8:00 AM in Phoenix. */
const CTX: PlanContext = {
  timeZone: "America/Phoenix",
  settings: ROUTING_DEFAULTS,
  depot: SHOP,
  today: "2026-10-20",
  nowMin: 480,
};
const ctx = (o: Partial<PlanContext> = {}): PlanContext => ({ ...CTX, ...o });

/** New York: Sunday 2026-11-01 is the day the clocks go back; 2026-03-08 they go forward. */
const NY = ctx({
  timeZone: "America/New_York",
  today: "2026-10-31",
  nowMin: 600,
  settings: { ...ROUTING_DEFAULTS, workDays: [0, 1, 2, 3, 4, 5, 6] },
});

// Phoenix is UTC-7: 16:00Z is 9:00 AM.
const DAY_JOBS: PlanJob[] = [
  planJob("j1", {
    property: at(FAR),
    scheduled_start: "2026-10-21T16:00:00Z",
    scheduled_end: "2026-10-21T17:00:00Z",
    route_order: 1,
  }),
  planJob("j2", {
    property: at(NEAR),
    scheduled_start: "2026-10-21T18:00:00Z",
    scheduled_end: "2026-10-21T19:30:00Z",
    route_order: 2,
  }),
  planJob("j3", {
    property: at(EAST),
    scheduled_start: "2026-10-21T20:00:00Z",
    scheduled_end: "2026-10-21T21:00:00Z",
    route_order: 3,
    arrival_fixed: true,
  }),
  planJob("j4", {
    property: null,
    scheduled_start: "2026-10-21T22:00:00Z",
    scheduled_end: "2026-10-21T23:00:00Z",
    route_order: 4,
  }),
];

const TODAY_JOBS: PlanJob[] = [
  planJob("t1", {
    status: "in_progress",
    property: at(NEAR),
    scheduled_start: "2026-10-20T15:00:00Z",
    scheduled_end: "2026-10-20T16:00:00Z",
    route_order: 1,
  }),
  planJob("t2", {
    property: at(FAR),
    scheduled_start: "2026-10-20T17:00:00Z",
    scheduled_end: "2026-10-20T19:00:00Z",
    route_order: 2,
  }),
  planJob("t3", {
    property: at(WEST),
    assigned_user_id: "u2",
    second_tech_id: "t1",
    scheduled_start: "2026-10-20T20:00:00Z",
    scheduled_end: "2026-10-20T21:00:00Z",
    route_order: 1,
  }),
];

const NY_JOBS: PlanJob[] = [
  planJob("n1", {
    property: at(NEAR),
    scheduled_start: "2026-11-01T14:00:00Z",
    scheduled_end: "2026-11-01T15:00:00Z",
    route_order: 1,
  }),
  planJob("n2", {
    property: at(EAST),
    scheduled_start: "2026-11-01T13:00:00Z",
    scheduled_end: "2026-11-01T14:00:00Z",
    route_order: 2,
    arrival_fixed: true,
  }),
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

const waiting = planJob("w1", {
  status: "unscheduled",
  assigned_user_id: null,
  property: at(NORTH),
});

const route = (techId: string, date: string, jobs: PlanJob[], label = true): SuggestRoute => ({
  techId,
  techName: techId === "t1" ? "Tony" : "Sam",
  date,
  jobs: jobs.map((j) => (label ? { ...j, label: `Customer ${j.id}` } : j)),
});

// office.ts (schedule dates and the timeline) and schedule-moves.ts.
export const schedule: ModuleCases = {
  isDateString: rule(
    (v: unknown) => isDateString(v),
    [
      ["2026-10-20"],
      ["2026-02-31"],
      ["2026-13-01"],
      ["2026-1-5"],
      ["20261020"],
      [""],
      ["2026-10-20T00"],
    ],
  ),
  addDays: rule(
    (d: string, n: number) => addDays(d, n),
    [
      ["2026-10-31", 1],
      ["2026-03-07", 1],
      ["2026-11-01", -1],
      ["2024-02-28", 1],
      ["2026-01-01", -1],
      ["2026-10-20", 0],
      ["2026-10-20", 400],
      ["2026-02-31", 0],
      ["nope", 1],
    ],
  ),
  addMonths: rule(
    (d: string, n: number) => addMonths(d, n),
    [
      ["2026-01-31", 1],
      ["2024-01-31", 1],
      ["2026-12-15", 1],
      ["2026-01-15", -1],
      ["2026-03-31", -1],
      ["2026-10-20", 0],
      ["2026-10-20", 27],
      ["2026-10-20", -27],
      ["nope", 1],
    ],
  ),
  monthGrid: rule(
    (d: string) => monthGrid(d),
    [["2026-10-18"], ["2026-02-10"], ["2027-02-01"], ["2026-06-30"]],
  ),
  scheduleDays: rule(
    (v: ScheduleView, d: string) => scheduleDays(v, d),
    [
      ["day", "2026-10-18"],
      ["week", "2026-10-18"],
      ["week", "2026-10-19"],
      ["week", "2026-12-31"],
      ["month", "2026-11-15"],
    ],
  ),
  formatDay: rule(
    (d: string, style?: "short" | "long") => formatDay(d, style),
    [
      ["2026-10-18"],
      ["2026-10-18", "long"],
      ["2026-05-06", "short"],
      ["2026-09-03", "long"],
      ["2026-02-31"],
      ["nope"],
    ],
  ),
  formatTime: rule(
    (iso: string, tz: string) => formatTime(iso, tz),
    [
      ["2026-10-12T16:00:00Z", "America/Phoenix"],
      ["2026-10-12T07:05:00Z", "America/Phoenix"],
      ["2026-10-12T19:00:00Z", "America/Phoenix"],
      ["2026-11-01T05:30:00Z", "America/New_York"],
      ["2026-11-01T06:30:00Z", "America/New_York"],
      ["2026-10-12T16:00:00Z", "Mars/Olympus"],
      ["later", "UTC"],
    ],
  ),

  planDay: rule(
    (c: PlanContext, techId: string, date: string, jobs: PlanJob[], known?: Known) =>
      planDay(c, techId, date, jobs, driveOf(known)),
    [
      [CTX, "t1", "2026-10-19", DAY_JOBS],
      [CTX, "t1", "2026-10-21", []],
      // A fixed time, a pool with no location, out-of-order stops.
      [CTX, "t1", "2026-10-21", DAY_JOBS],
      // Today: a started job stays; the second tech's stop isn't theirs to save; nothing before now.
      [ctx({ nowMin: 700 }), "t1", "2026-10-20", TODAY_JOBS],
      // No shop location; a short day runs over.
      [
        ctx({ depot: null, settings: { ...ROUTING_DEFAULTS, dayEnd: "10:00" } }),
        "t1",
        "2026-10-21",
        DAY_JOBS.slice(0, 2),
      ],
      // A fixed time that can't be met.
      [
        ctx(),
        "t1",
        "2026-10-21",
        [
          planJob("a", {
            property: at(FAR),
            scheduled_start: "2026-10-21T15:00:00Z",
            scheduled_end: "2026-10-21T22:00:00Z",
          }),
          planJob("b", {
            property: at(NORTH),
            arrival_fixed: true,
            scheduled_start: "2026-10-21T16:00:00Z",
          }),
        ],
      ],
      // The day the clocks go back in New York.
      [NY, "t1", "2026-11-01", NY_JOBS],
      // Locks: a time lock keeps its time; a day lock alone may move within the day.
      [
        ctx(),
        "t1",
        "2026-10-21",
        [
          planJob("a", {
            property: at(FAR),
            lock_day: true,
            scheduled_start: "2026-10-21T15:00:00Z",
            scheduled_end: "2026-10-21T16:00:00Z",
          }),
          planJob("b", {
            property: at(NEAR),
            lock_time: true,
            scheduled_start: "2026-10-21T17:00:00Z",
            scheduled_end: "2026-10-21T18:00:00Z",
          }),
          planJob("c", {
            property: at(EAST),
            lock_day: true,
            lock_time: true,
            scheduled_start: "2026-10-21T19:00:00Z",
          }),
        ],
      ],
    ],
  ),
  renumberDay: rule(
    (techId: string, jobs: PlanJob[], leaving: string) => renumberDay(techId, jobs, leaving),
    [
      ["t1", [], "x"],
      ["t1", DAY_JOBS, "j2"],
      ["t1", DAY_JOBS, "j4"],
      ["t1", TODAY_JOBS, "t1"],
      ["u2", TODAY_JOBS, "zz"],
    ],
  ),
  moveJobChange: rule(
    (c: PlanContext, input: MoveInput, known?: Known) => moveJobChange(c, input, driveOf(known)),
    [
      // Refusals.
      [CTX, move({ job: planJob("x", { status: "canceled" }) })],
      [CTX, move({ job: planJob("x", { status: "in_progress" }), date: null })],
      [CTX, move({ job: waiting, date: "2026-10-19" })],
      [CTX, move({ job: waiting, tech: "u2", seesAll: false })],
      [CTX, move({ job: planJob("x", { second_tech_id: "t1" }) })],
      // Off the schedule: the day it left closes up.
      [
        CTX,
        move({
          job: DAY_JOBS[0]!,
          tech: null,
          date: null,
          fromDay: DAY_JOBS,
        }),
      ],
      // Nobody yet: keeps its time, or the start of the day.
      [CTX, move({ job: DAY_JOBS[1]!, tech: null, date: "2026-10-23", fromDay: DAY_JOBS })],
      [CTX, move({ job: waiting, tech: null, date: "2026-10-23" })],
      // A limited tech may take a job off their own schedule (no date).
      [CTX, move({ job: DAY_JOBS[3]!, tech: null, date: null, seesAll: false, userId: "u2" })],
      // Onto a day, first; then past the end; then in the middle.
      [CTX, move({ job: waiting, index: 0, targetDay: DAY_JOBS })],
      [CTX, move({ job: waiting, index: 99, targetDay: DAY_JOBS })],
      [CTX, move({ job: waiting, index: -3, targetDay: DAY_JOBS })],
      [CTX, move({ job: waiting, index: 2, targetDay: DAY_JOBS })],
      // Within the same day: reordered, no renumbering of the day it left.
      [CTX, move({ job: DAY_JOBS[2]!, index: 0, targetDay: DAY_JOBS, fromDay: DAY_JOBS })],
      [CTX, move({ job: DAY_JOBS[0]!, index: 3, targetDay: DAY_JOBS, fromDay: DAY_JOBS })],
      // To another tech and day: the old day closes up; a fixed time moves with the job.
      [
        CTX,
        move({
          job: DAY_JOBS[2]!,
          tech: "u2",
          date: "2026-10-22",
          targetDay: [],
          fromDay: DAY_JOBS,
        }),
      ],
      // Today, after now; a started job keeps its status.
      [
        ctx({ nowMin: 900 }),
        move({
          job: TODAY_JOBS[0]!,
          date: "2026-10-20",
          index: 1,
          targetDay: TODAY_JOBS,
          fromDay: TODAY_JOBS,
        }),
      ],
      [
        ctx({ nowMin: 600 }),
        move({ job: waiting, date: "2026-10-20", index: 1, targetDay: TODAY_JOBS }),
      ],
      // A long job pushes the stops after it late and over the day.
      [
        CTX,
        move({
          job: planJob("big", {
            status: "unscheduled",
            assigned_user_id: null,
            property: at(WEST),
            scheduled_start: "2026-10-21T15:00:00Z",
            scheduled_end: "2026-10-22T00:00:00Z",
          }),
          index: 0,
          targetDay: DAY_JOBS,
        }),
      ],
      // A fixed time that can't be made where it's put.
      [
        CTX,
        move({
          job: planJob("fx", {
            assigned_user_id: "u2",
            arrival_fixed: true,
            property: at(NORTH),
            scheduled_start: "2026-10-21T15:30:00Z",
            scheduled_end: "2026-10-21T16:30:00Z",
          }),
          index: 4,
          targetDay: DAY_JOBS,
        }),
      ],
      // A time lock alone keeps its clock time on the new day; a day lock alone doesn't.
      [
        CTX,
        move({
          job: planJob("tl", {
            assigned_user_id: "u2",
            lock_time: true,
            property: at(NORTH),
            scheduled_start: "2026-10-21T20:00:00Z",
            scheduled_end: "2026-10-21T21:00:00Z",
          }),
          index: 0,
          targetDay: DAY_JOBS,
        }),
      ],
      [
        CTX,
        move({
          job: planJob("dl", {
            assigned_user_id: "u2",
            lock_day: true,
            property: at(NORTH),
            scheduled_start: "2026-10-21T20:00:00Z",
            scheduled_end: "2026-10-21T21:00:00Z",
          }),
          index: 0,
          targetDay: DAY_JOBS,
        }),
      ],
      // New York, onto the day the clocks go back.
      [NY, move({ job: waiting, date: "2026-11-01", index: 1, targetDay: NY_JOBS })],
      [
        NY,
        move({
          job: NY_JOBS[1]!,
          date: "2026-11-02",
          targetDay: [],
          fromDay: NY_JOBS,
        }),
      ],
    ],
  ),
  suggestionDates: rule(
    (c: PlanContext) => suggestionDates(c),
    [
      [CTX],
      // Too late today: starts tomorrow.
      [ctx({ nowMin: 961 })],
      [ctx({ nowMin: 960 })],
      [ctx({ settings: { ...ROUTING_DEFAULTS, workDays: [6] } })],
      [ctx({ settings: { ...ROUTING_DEFAULTS, workDays: [] } })],
      [NY],
    ],
  ),
  suggestTimes: rule(
    (
      c: PlanContext,
      job: { id?: string; location: LatLng | null; durationMin: number },
      routes: SuggestRoute[],
      known?: Known | null,
      limit?: number,
    ) => suggestTimes(c, job, routes, driveOf(known ?? {}), limit),
    [
      [CTX, { location: NORTH, durationMin: 60 }, []],
      [
        CTX,
        { id: "w1", location: NORTH, durationMin: 60 },
        [
          route("t1", "2026-10-20", TODAY_JOBS),
          route("u2", "2026-10-20", []),
          route("t1", "2026-10-21", DAY_JOBS),
          route("u2", "2026-10-21", [], false),
        ],
      ],
      // The job is left out of the route it's on; no labels: "the job before".
      [
        CTX,
        { id: "j2", location: NEAR, durationMin: 90 },
        [route("t1", "2026-10-21", DAY_JOBS, false), route("t1", "2026-10-22", [])],
        null,
        1,
      ],
      // No location.
      [CTX, { location: null, durationMin: 60 }, [route("t1", "2026-10-21", DAY_JOBS)]],
      // No gaps: a short day already full.
      [
        ctx({ settings: { ...ROUTING_DEFAULTS, dayEnd: "10:00" } }),
        { location: FAR, durationMin: 120 },
        [route("t1", "2026-10-21", DAY_JOBS.slice(0, 2))],
      ],
      [
        NY,
        { location: WEST, durationMin: 45 },
        [route("t1", "2026-10-31", []), route("t1", "2026-11-01", NY_JOBS)],
      ],
    ],
  ),

  timeline: rule(
    (entries: AuditEntry[], labels: Record<string, string>) =>
      timeline(entries, (table, row) => labels[`${table}:${row}`]),
    [
      [[], {}],
      [
        [
          audit("job", "j1", "status", null, "scheduled", "2026-10-12T16:00:00Z"),
          audit("job", "j1", "number", null, 1042, "2026-10-12T16:00:00Z"),
          audit("job", "j1", "status", "scheduled", "in_progress", "2026-10-12T17:00:00Z"),
          audit("job", "j1", "status", "bogus", "weird", "2026-10-12T17:05:00Z"),
          audit("job", "j1", "assigned_user_id", "u1", "u2", "2026-10-12T17:06:00Z"),
          audit("job", "j1", "scheduled_start", "a", "b", "2026-10-12T17:07:00Z"),
          audit("job", "j1", "summary_notes", "", "x", "2026-10-12T17:08:00Z"),
          audit("job", "j1", "deleted_at", null, "2026-10-12T18:00:00Z", "2026-10-12T18:00:00Z"),
          audit("job", "j1", "updated_at", "a", "b", "2026-10-12T18:01:00Z"),
          audit("job", "j1", "sort_order", 1, 2, "2026-10-12T18:02:00Z"),
        ],
        {},
      ],
      [
        [
          audit("checklist_item_result", "c1", "status", null, "pending", "2026-10-12T16:00:00Z"),
          audit(
            "checklist_item_result",
            "c1",
            "status",
            "pending",
            "inspected",
            "2026-10-12T16:01:00Z",
          ),
          audit("checklist_item_result", "c1", "method", null, "Dye test", "2026-10-12T16:01:00Z"),
          audit(
            "checklist_item_result",
            "c2",
            "status",
            "pending",
            "excluded",
            "2026-10-12T16:02:00Z",
          ),
          audit(
            "checklist_item_result",
            "c2",
            "exclusion_reason",
            null,
            "Covered by deck",
            "2026-10-12T16:02:00Z",
          ),
          audit(
            "checklist_item_result",
            "c3",
            "status",
            "inspected",
            "pending",
            "2026-10-12T16:03:00Z",
          ),
          audit(
            "checklist_item_result",
            "c3",
            "status",
            "pending",
            "inspected",
            "2026-10-12T16:04:00Z",
          ),
          audit("job_component", "k1", "label", null, "Main drain", "2026-10-12T16:05:00Z"),
          audit("job_component", "k2", "label", null, "Return", "2026-10-12T16:05:00Z"),
          audit(
            "job_component",
            "k2",
            "deleted_at",
            null,
            "2026-10-12T16:06:00Z",
            "2026-10-12T16:06:00Z",
          ),
        ],
        {
          "checklist_item_result:c1": "Skimmer",
          "job_component:k2": "Return 2",
          "checklist_item_result:c3": "",
        },
      ],
      [
        [
          audit("test_result", "t1", "outcome", null, "pass", "2026-10-12T16:00:00Z"),
          audit("test_result", "t1", "outcome", "pass", "fail", "2026-10-12T16:01:00Z"),
          audit("test_result", "t1", "data", {}, { psi: 20 }, "2026-10-12T16:02:00Z"),
          audit("test_result", "t2", "data", null, null, "2026-10-12T16:03:00Z"),
          audit("finding", "f1", "title", null, "Cracked skimmer", "2026-10-12T16:04:00Z"),
          audit("finding", "f1", "status", "open", "repaired", "2026-10-12T16:05:00Z"),
          audit("finding", "f2", "notes", "a", "b", "2026-10-12T16:06:00Z"),
          audit("media", "m1", "kind", null, "audio", "2026-10-12T16:07:00Z"),
          audit("media", "m1", "upload_state", "pending", "uploaded", "2026-10-12T16:08:00Z"),
          audit("media", "m1", "transcript", null, "hello", "2026-10-12T16:09:00Z"),
          audit("media", "m2", "markup", null, [1, 2], "2026-10-12T16:10:00Z"),
          audit("media", "m2", "caption", "a", "b", "2026-10-12T16:11:00Z"),
          audit("media", "m3", "kind", null, "scan", "2026-10-12T16:12:00Z"),
          audit("media", "m3", "width", 1, 2, "2026-10-12T16:13:00Z"),
          audit("customer", "x1", "name", null, "Riley", "2026-10-12T16:14:00Z", null),
          audit("customer", "x1", "phone", "1", "2", "2026-10-12T16:15:00Z"),
          audit("pool_visit", "p1", "chlorine_level", 1, 2, "2026-10-12T16:16:00Z"),
          audit("property", "p2", null, null, null, "2026-10-12T16:17:00Z"),
        ],
        { "test_result:t1": "Pressure test", "finding:f2": "Leak at light", "media:m2": "photo" },
      ],
    ],
  ),
};
