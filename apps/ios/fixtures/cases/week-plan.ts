import {
  durationLabel,
  PLAN_WEEK_LIMIT,
  planWeek,
  planWeekSplit,
  planWeekSummary,
  type LatLng,
  type WeekDay,
  type WeekJob,
  type WorkDay,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";
import { driveOf, type Known } from "./routing";

// week-plan.ts (Plan Week, owner 2026-10-20).

const DAY: WorkDay = { startMin: 480, endMin: 1020 };
const SHORT_DAY: WorkDay = { startMin: 480, endMin: 720 };
const DEPOT: LatLng = { lat: 33.45, lng: -112.07 };
const north = (i: number): LatLng => ({ lat: 33.65 + i * 0.002, lng: -112.07 });
const south = (i: number): LatLng => ({ lat: 33.25 - i * 0.002, lng: -112.07 });
const east = (i: number): LatLng => ({ lat: 33.45, lng: -111.85 + i * 0.002 });

const job = (id: string, location: LatLng | null, o: Partial<WeekJob> = {}): WeekJob => ({
  id,
  location,
  durationMin: 30,
  techId: null,
  date: null,
  techs: ["t1"],
  ...o,
});
const days = (dates: string[], stays: Record<string, WeekDay["stays"]> = {}): WeekDay[] =>
  dates.map((date) => ({ techId: "t1", date, stays: stays[date] ?? [] }));

type Input = {
  days: WeekDay[];
  jobs: WeekJob[];
  depot: LatLng | null;
  day: WorkDay;
  even?: boolean;
};
const crew = (techs: string[], dates: string[]): WeekDay[] =>
  techs.flatMap((techId) => dates.map((date) => ({ techId, date, stays: [] })));
const three = ["t1", "t2", "t3"];

export const weekPlan: ModuleCases = {
  PLAN_WEEK_LIMIT: rule(() => PLAN_WEEK_LIMIT, [[]]),
  planWeek: rule(
    (input: Input, known?: Known | null, limit?: number | null) =>
      planWeek({ ...input, drive: driveOf(known ?? {}), limit: limit ?? undefined }),
    [
      // Nothing to plan.
      [{ days: [], jobs: [], depot: DEPOT, day: DAY }],
      // Several techs, split evenly (owner, 2026-10-20), and the same without `even`.
      ...[true, false].map(
        (even) =>
          [
            {
              days: crew(three, ["2026-10-26", "2026-10-27"]),
              jobs: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => job(`n${i}`, north(i), { techs: three })),
              depot: DEPOT,
              day: DAY,
              even,
            },
          ] as [Input],
      ),
      // A job given to one tech stays theirs; long jobs balance by minutes.
      [
        {
          days: crew(["t1", "t2"], ["2026-10-26"]),
          jobs: [
            job("x", south(0), { techs: ["t2"], durationMin: 120 }),
            ...[0, 1, 2, 3].map((i) =>
              job(`e${i}`, east(i), { techs: ["t1", "t2"], durationMin: 60 }),
            ),
          ],
          depot: DEPOT,
          day: DAY,
          even: true,
        },
      ],
      [{ days: days(["2026-10-26"]), jobs: [], depot: DEPOT, day: DAY }],
      // Each area on its own day when both don't fit in one.
      [
        {
          days: days(["2026-10-26", "2026-10-27"]),
          jobs: [0, 1, 2].flatMap((i) => [
            job(`n${i}`, north(i), { durationMin: 120 }),
            job(`s${i}`, south(i), { durationMin: 120 }),
          ]),
          depot: DEPOT,
          day: DAY,
        },
      ],
      // Scheduled jobs swap days for less driving.
      [
        {
          days: days(["2026-10-27", "2026-10-26"]),
          jobs: [
            job("a", north(0), { techId: "t1", date: "2026-10-26" }),
            job("b", south(0), { techId: "t1", date: "2026-10-26" }),
            job("c", north(1), { techId: "t1", date: "2026-10-27" }),
            job("d", south(1), { techId: "t1", date: "2026-10-27" }),
          ],
          depot: DEPOT,
          day: DAY,
        },
      ],
      // A time lock keeps its clock time; today's day starts after now.
      [
        {
          days: [
            { techId: "t1", date: "2026-10-26", stays: [], earliestMin: 720 },
            { techId: "t1", date: "2026-10-27", stays: [] },
          ],
          jobs: [
            job("a", north(0), { timeMin: 780 }),
            job("b", north(1), { timeMin: 540, techId: "t1", date: "2026-10-26" }),
            job("c", east(0)),
          ],
          depot: DEPOT,
          day: DAY,
        },
      ],
      // Only its own techs; Needs a Time jobs that don't fit stay there.
      [
        {
          days: days(["2026-10-26"]),
          jobs: [
            job("a", north(0), { durationMin: 300 }),
            job("b", north(0), { durationMin: 300 }),
            job("x", north(0), { techs: ["t2"] }),
          ],
          depot: DEPOT,
          day: DAY,
        },
      ],
      // A scheduled job that fits nowhere stays on its own day.
      [
        {
          days: days(["2026-10-26"], {
            "2026-10-26": [{ id: "big", location: north(0), durationMin: 520, fixedStartMin: 480 }],
          }),
          jobs: [job("a", south(0), { techId: "t1", date: "2026-10-26" })],
          depot: DEPOT,
          day: DAY,
        },
      ],
      // Two techs, stays on days, a job with no location, no shop, a short day.
      [
        {
          days: [
            {
              techId: "t2",
              date: "2026-10-26",
              stays: [{ id: "st", location: east(1), durationMin: 60 }],
            },
            { techId: "t1", date: "2026-10-26", stays: [] },
            {
              techId: "t1",
              date: "2026-10-27",
              stays: [{ id: "fx", location: south(2), durationMin: 60, fixedStartMin: 600 }],
            },
          ],
          jobs: [
            job("j3", null, { techs: ["t1", "t2"] }),
            job("j1", east(2), { techs: ["t1", "t2"], techId: "t1", date: "2026-10-27" }),
            job("j2", south(1), { techs: ["t1", "t2"], durationMin: 90 }),
            job("j10", north(3), { techs: ["t1", "t2"], durationMin: 45 }),
            job("J0", north(4), { techs: ["t2"], techId: "t2", date: "2026-10-26" }),
          ],
          depot: null,
          day: SHORT_DAY,
        },
      ],
      // The same jobs with the shop, and a one-way drive table.
      [
        {
          days: [
            {
              techId: "t2",
              date: "2026-10-26",
              stays: [{ id: "st", location: east(1), durationMin: 60 }],
            },
            { techId: "t1", date: "2026-10-26", stays: [] },
          ],
          jobs: [
            job("j1", east(2), { techs: ["t1", "t2"] }),
            job("j2", south(1), { techs: ["t1", "t2"], durationMin: 90 }),
            job("j10", north(3), { techs: ["t1", "t2"], durationMin: 45 }),
          ],
          depot: DEPOT,
          day: SHORT_DAY,
        },
        { "33.4500,-112.0700>33.4500,-111.8460": 2, "33.4500,-111.8460>33.4500,-112.0700": 90 },
      ],
      // Past the limit: the rest wait for the next run.
      [
        {
          days: days(["2026-10-26", "2026-10-27", "2026-10-28"]),
          jobs: [north(0), south(0), north(2), south(3), north(4)].map((l, i) => job(`j${i}`, l)),
          depot: DEPOT,
          day: DAY,
        },
        null,
        3,
      ],
      // Ties: the job's own day wins, then the earlier day.
      [
        {
          days: days(["2026-10-26", "2026-10-27", "2026-10-28"]),
          jobs: [job("a", north(0), { techId: "t1", date: "2026-10-28" }), job("b", north(0))],
          depot: DEPOT,
          day: DAY,
        },
      ],
    ],
  ),
  planWeekSplit: rule(
    (split: { techId: string; jobs: number; minutes: number }[]) =>
      planWeekSplit({ split }, (t) => ({ t1: "Ana", t2: "Ben" })[t] ?? "Tech"),
    [
      [[]],
      [[{ techId: "t1", jobs: 3, minutes: 90 }]],
      [
        [
          { techId: "t1", jobs: 1, minutes: 30 },
          { techId: "t2", jobs: 4, minutes: 120 },
          { techId: "t9", jobs: 0, minutes: 0 },
        ],
      ],
    ],
  ),
  planWeekSummary: rule(
    (p: Parameters<typeof planWeekSummary>[0]) => planWeekSummary(p, durationLabel),
    [
      [{ moved: 0, driveBefore: 50, driveAfter: 50, unplaced: [], skipped: [] }],
      [{ moved: 1, driveBefore: 50, driveAfter: 60, unplaced: [], skipped: [] }],
      [{ moved: 9, driveBefore: 300, driveAfter: 110, unplaced: ["a"], skipped: [] }],
      [{ moved: 2, driveBefore: 30, driveAfter: 5, unplaced: ["a", "b"], skipped: ["c"] }],
      [{ moved: 0, driveBefore: 0, driveAfter: 0, unplaced: [], skipped: ["c", "d"] }],
    ],
  ),
};
