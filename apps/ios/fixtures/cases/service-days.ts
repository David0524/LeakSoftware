import {
  moveServiceDay,
  serviceDays,
  suggestServiceDays,
  type LatLng,
  type RoutePlan,
  type ServicePlan,
  type WorkDay,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";
import { driveOf, type Known } from "./routing";

// service-days.ts (Routes: a pool customer's service day, owner 2026-10-20).

type Shape = Pick<
  ServicePlan,
  "starts_on" | "interval_weeks" | "weekdays" | "monthly" | "ends_on" | "paused"
>;
const plan = (o: Partial<Shape> = {}): Shape => ({
  starts_on: "2026-10-05", // a Monday
  interval_weeks: 1,
  weekdays: null,
  monthly: false,
  ends_on: null,
  paused: false,
  ...o,
});

const DEPOT: LatLng = { lat: 33.45, lng: -112.07 };
const DAY: WorkDay = { startMin: 480, endMin: 1020 };
const at = (lat: number, lng = -112.07): LatLng => ({ lat, lng });
const rp = (id: string, o: Partial<RoutePlan> = {}): RoutePlan => ({
  id,
  techId: null,
  days: [],
  location: null,
  durationMin: 30,
  ...o,
});

type Input = Omit<Parameters<typeof suggestServiceDays>[0], "drive">;

export const serviceDaysCases: ModuleCases = {
  serviceDays: rule(
    (p: Shape) => serviceDays(p),
    [
      [plan()],
      [plan({ weekdays: [4, 1] })],
      [plan({ weekdays: [] })],
      [plan({ starts_on: "2026-10-11", weekdays: [6, 0, 3] })],
    ],
  ),
  moveServiceDay: rule(
    (p: Shape, from: number, to: number, today: string) => moveServiceDay(p, from, to, today),
    [
      // Weekly: the first new day from today.
      [plan(), 1, 4, "2026-10-21"],
      [plan(), 1, 3, "2026-10-21"],
      [plan(), 1, 1, "2026-10-21"],
      // Every 2 weeks keeps its week.
      [plan({ interval_weeks: 2 }), 1, 2, "2026-10-19"],
      [plan({ interval_weeks: 2 }), 1, 5, "2026-10-21"],
      [plan({ interval_weeks: 2 }), 1, 0, "2026-10-21"],
      // Already on that day.
      [plan({ interval_weeks: 2 }), 2, 1, "2026-10-21"],
      // Monthly keeps its week of the month; a 5th week reads as the 4th.
      [plan({ monthly: true }), 1, 5, "2026-10-21"],
      [plan({ monthly: true }), 1, 0, "2026-10-21"],
      [plan({ monthly: true, starts_on: "2026-10-29" }), 4, 1, "2026-10-21"],
      [plan({ interval_weeks: 4, starts_on: "2026-10-26" }), 1, 6, "2026-10-21"],
      // Paused plans move as if running; one that has ended starts from its first day.
      [plan({ interval_weeks: 2, paused: true }), 1, 3, "2026-10-21"],
      [plan({ interval_weeks: 2, ends_on: "2026-10-10" }), 1, 3, "2026-10-21"],
      // Several days a week: that day swaps.
      [plan({ weekdays: [1, 4] }), 4, 3, "2026-10-21"],
      [plan({ weekdays: [1, 4] }), 4, 1, "2026-10-21"],
      [plan({ weekdays: [5, 1, 3] }), 3, 0, "2026-10-21"],
    ],
  ),
  suggestServiceDays: rule(
    (input: Input, known?: Known) => suggestServiceDays({ ...input, drive: driveOf(known) }),
    [
      [{ place: [], keep: [], techs: [], workDays: [], depot: DEPOT, day: DAY }],
      // Each area on its own day; plans on several days and without a location are left.
      [
        {
          place: [
            ...[0, 1, 2].map((i) =>
              rp(`n${i}`, { location: at(33.65 + i / 500), durationMin: 120 }),
            ),
            ...[0, 1, 2].map((i) =>
              rp(`s${i}`, { location: at(33.25 - i / 500), durationMin: 120 }),
            ),
            rp("nomap"),
            rp("twice", { techId: "t1", days: [1, 4], location: at(33.5) }),
          ],
          keep: [],
          techs: ["t1"],
          workDays: [1, 2],
          depot: DEPOT,
          day: DAY,
        },
      ],
      // Kept plans count toward their days; a plan's own tech; a tech that isn't offered.
      [
        {
          place: [
            rp("a", { techId: "t2", days: [3], location: at(33.6) }),
            rp("b", { location: at(33.3, -111.9) }),
            rp("c", { techId: "gone", location: at(33.61) }),
            rp("d", { location: at(33.62), durationMin: 600 }),
          ],
          keep: [
            rp("k1", { techId: "t1", days: [1], location: at(33.6), durationMin: 60 }),
            rp("k2", { techId: "t2", days: [1, 3], location: at(33.3, -111.9), durationMin: 60 }),
            rp("k3", { techId: "t3", days: [1], location: at(33.0) }),
          ],
          techs: ["t1", "t2"],
          workDays: [1, 3, 5],
          depot: null,
          day: DAY,
        },
      ],
    ],
  ),
};
