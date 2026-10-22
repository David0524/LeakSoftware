import {
  HERO_ACTION_LABELS,
  heroActions,
  heroDrive,
  heroHeadline,
  heroSegmentsSpoken,
  heroSubtitle,
  heroTopLine,
  onTheWay,
  todayHero,
  type HeroMoment,
  type HeroStop,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

const TZ = "America/Phoenix";
const today = "2026-10-20";
const stop = (id: string, over: Partial<HeroStop> = {}): HeroStop => ({
  id,
  type: "detection",
  status: "scheduled",
  customer: `Customer ${id}`,
  address: `${id} Palm Ln`,
  scheduled_start: "2026-10-20T16:00:00Z", // 9:00 AM in Phoenix
  checklistDone: 0,
  checklistTotal: 0,
  ...over,
});
const omw = { on_my_way_at: "2026-10-20T16:30:00Z", arrive_at: "2026-10-20T16:52:00Z" };

type HeroArgs = [HeroStop[], string, string, string | null];
const days: HeroArgs[] = [
  [[], today, TZ, null],
  [[stop("a")], today, TZ, null],
  [
    [stop("a", { stop_done_on: today }), stop("b", { access: "Gate 4821" }), stop("c")],
    today,
    TZ,
    null,
  ],
  [[stop("a"), stop("b", omw)], today, TZ, null],
  [[stop("a", omw), stop("b", omw)], today, TZ, null],
  [[stop("a"), stop("b", { ...omw, arrive_at: null })], today, TZ, null],
  [[stop("a"), stop("b", { ...omw, arrive_at: "" })], today, TZ, null],
  [[stop("a", { on_my_way_at: "2026-10-19T16:30:00Z" })], today, TZ, null],
  [[stop("a", { on_my_way_at: "" })], today, TZ, null],
  // 11 PM on the 19th in Phoenix is the 20th in UTC: not today.
  [[stop("a", { on_my_way_at: "2026-10-20T06:00:00Z" })], today, TZ, null],
  [[stop("a", { on_my_way_at: "2026-10-20T06:00:00Z" })], today, "UTC", null],
  [
    [stop("a"), stop("b", { status: "in_progress", checklistDone: 4, checklistTotal: 9 })],
    today,
    TZ,
    null,
  ],
  [[stop("a", { status: "in_progress" }), stop("b", omw)], today, TZ, null],
  [[stop("a", { status: "in_progress", ...omw })], today, TZ, null],
  [[stop("a", { ...omw, stop_done_on: today }), stop("b")], today, TZ, null],
  [[stop("a", { status: "done", type: "maintenance" }), stop("b")], today, TZ, "a"],
  [[stop("a", { status: "done", type: "maintenance" }), stop("b")], today, TZ, ""],
  [[stop("a"), stop("b")], today, TZ, "a"],
  [[stop("a", { stop_done_on: today, checklistDone: 9, checklistTotal: 9 })], today, TZ, "a"],
  // A repair job has no checklist (owner, 2026-10-22): rows it already has aren't counted.
  [
    [stop("a", { type: "repair", status: "in_progress", checklistDone: 2, checklistTotal: 9 })],
    today,
    TZ,
    null,
  ],
  [[stop("a", { type: "repair", stop_done_on: today, checklistTotal: 9 })], today, TZ, "a"],
  [[stop("a", { stop_done_on: today }), stop("b", { status: "report_sent" })], today, TZ, null],
  [[stop("a", { status: "canceled" })], today, TZ, null],
  [[stop("a", { stop_done_on: "2026-10-19" }), stop("b")], today, TZ, null],
  [
    [
      stop("a", { status: "done" }),
      stop("b", { scheduled_start: null }),
      stop("c", { scheduled_start: "" }),
      stop("d", { scheduled_start: "2026-10-20T20:15:00Z" }),
    ],
    today,
    TZ,
    null,
  ],
  [[stop("a", { scheduled_start: null }), stop("b", { address: null })], today, TZ, null],
  [
    [stop("a", { address: "" }), stop("b", { address: null, access: "  Side gate.\n Dog.  " })],
    today,
    TZ,
    null,
  ],
  [[stop("a", { access: "x".repeat(120) })], today, TZ, null],
  [[stop("a", { status: "done", access: "Gate" }), stop("b", { access: "Gate" })], today, TZ, "a"],
  [[stop("a", { status: "in_progress", access: "Gate", checklistTotal: 0 })], today, TZ, null],
  [
    [
      stop("a", {
        cleanings: [{ name: "Clean salt cell", kind: "salt_cell", days: 3, weeks: 0 }],
      }),
      stop("b", { cleanings: [{ name: "Clean filter", kind: "filter", days: 21, weeks: 3 }] }),
    ],
    today,
    TZ,
    null,
  ],
  [
    [
      stop("a", {
        status: "done",
        cleanings: [{ name: "Clean filter", kind: "filter", days: 0, weeks: 0 }],
      }),
    ],
    today,
    TZ,
    "a",
  ],
  [[stop("a", { on_my_way_at: "not a date" })], today, TZ, null],
  [[stop("a", { scheduled_start: "not a date" })], today, TZ, null],
  [
    [stop("a"), stop("b", omw), stop("c", { scheduled_start: "2026-10-21T01:30:00Z" })],
    today,
    TZ,
    null,
  ],
  [[stop("a"), stop("b"), stop("c")], today, "America/New_York", null],
];

const moments: HeroMoment[] = ["ahead", "driving", "on_site", "done", "day_done"];

// today-hero.ts: Today's card for the stop a tech is on (owner, 2026-10-20).
export const todayHeroCases: ModuleCases = {
  todayHero: rule(
    (stops: HeroStop[], day: string, timeZone: string, justDone: string | null) =>
      todayHero({ stops, today: day, timeZone, justDone }),
    days,
  ),
  // Owner, 2026-10-20: swipe the card back to an earlier stop (or ahead to a later one).
  todayHeroViewing: rule(
    (stops: HeroStop[], day: string, timeZone: string, viewing: string | null) =>
      todayHero({ stops, today: day, timeZone, viewing }),
    [
      [[stop("a", { stop_done_on: today }), stop("b"), stop("c")], today, TZ, "a"],
      [[stop("a", { stop_done_on: today }), stop("b"), stop("c")], today, TZ, "b"],
      [
        [stop("a", { stop_done_on: today }), stop("b"), stop("c", { access: "Gate" })],
        today,
        TZ,
        "c",
      ],
      [[stop("a", { stop_done_on: today }), stop("b", omw), stop("c")], today, TZ, "c"],
      [[stop("a", { status: "in_progress" }), stop("b", omw)], today, TZ, "b"],
      [[stop("a", { status: "done" }), stop("b", { status: "done" })], today, TZ, "a"],
      [[stop("a"), stop("b")], today, TZ, "missing"],
      [[stop("a"), stop("b")], today, TZ, null],
    ],
  ),
  onTheWay: rule(
    (s: HeroStop, day: string, timeZone: string) => onTheWay(s, day, timeZone),
    [
      [stop("a"), today, TZ],
      [stop("a", omw), today, TZ],
      [stop("a", omw), "2026-10-21", TZ],
      [stop("a", { ...omw, status: "in_progress" }), today, TZ],
      [stop("a", { ...omw, stop_done_on: today }), today, TZ],
      [stop("a", { ...omw, status: "done" }), today, TZ],
      [stop("a", { on_my_way_at: "" }), today, TZ],
      [stop("a", { on_my_way_at: "2026-10-20T06:00:00Z" }), today, TZ],
      [stop("a", { on_my_way_at: "2026-10-20T06:00:00Z" }), today, "UTC"],
      [stop("a", { on_my_way_at: "nope" }), today, TZ],
    ],
  ),
  heroActions: rule(
    (moment: HeroMoment, mine: boolean, checklistDone: boolean, hasChecklist: boolean) =>
      heroActions(moment, mine, checklistDone, hasChecklist),
    moments.flatMap((m) => [
      [m, true, false, true] as [HeroMoment, boolean, boolean, boolean],
      [m, false, false, true] as [HeroMoment, boolean, boolean, boolean],
      [m, true, true, true] as [HeroMoment, boolean, boolean, boolean],
      // A repair job: no checklist (owner, 2026-10-22).
      [m, true, false, false] as [HeroMoment, boolean, boolean, boolean],
      [m, false, false, false] as [HeroMoment, boolean, boolean, boolean],
    ]),
  ),
  HERO_ACTION_LABELS: rule(() => HERO_ACTION_LABELS, [[]]),
  heroSubtitle: rule(
    (typeLabel: string, stop: number, stops: number, moment: HeroMoment) =>
      heroSubtitle(typeLabel, { stop, stops, moment }),
    [
      ["Leak detection", 3, 7, "ahead"],
      ["Maintenance", 1, 1, "on_site"],
      ["Repair", 2, 2, "done"],
      ["Pool inspection", 4, 4, "day_done"],
      ["", 1, 3, "driving"],
    ],
  ),
  heroDrive: rule(
    (moment: HeroMoment, driveMin: number | null) => heroDrive(moment, driveMin),
    [
      ["ahead", 14],
      ["ahead", 1],
      ["ahead", 59],
      ["ahead", 60],
      ["ahead", 75],
      ["ahead", 120],
      ["ahead", 185],
      ["ahead", 0],
      ["ahead", -5],
      ["ahead", null],
      ["driving", 14],
      ["on_site", 14],
      ["done", 14],
      ["day_done", 14],
    ],
  ),
  heroHeadline: rule(
    (moment: HeroMoment, headline: string) =>
      heroHeadline({ moment, content: { headline } as never }),
    moments.map((m) => [m, "All 6 stops done"] as [HeroMoment, string]),
  ),
  heroTopLine: rule(
    (stops: HeroStop[], day: string, timeZone: string, viewing: string | null) =>
      heroTopLine(todayHero({ stops, today: day, timeZone, viewing })!),
    [
      [[stop("a"), stop("b")], today, TZ, null],
      [[stop("a", omw), stop("b")], today, TZ, null],
      [[stop("a", { status: "in_progress" }), stop("b")], today, TZ, null],
      [[stop("a", { stop_done_on: today }), stop("b")], today, TZ, "a"],
      [[stop("a", { stop_done_on: today })], today, TZ, null],
    ],
  ),
  heroSegmentsSpoken: rule(
    (doneCount: number, stops: number) => heroSegmentsSpoken({ doneCount, stops }),
    [
      [0, 1],
      [1, 1],
      [2, 7],
      [0, 0],
    ],
  ),
};
