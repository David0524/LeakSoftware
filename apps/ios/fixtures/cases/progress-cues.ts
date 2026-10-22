import {
  COMPLETE_READY_LINE,
  TEAM_TODAY_TITLE,
  aboutLabel,
  checklistReady,
  dayProgress,
  lastDoneLine,
  techDayProgress,
  type ProgressStop,
  type TeamStop,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// progress-cues.ts (owner, 2026-10-22): Today's ring, and Mark Complete as the last thing.

const s = (done: boolean, durationMin = 30, driveMin: number | null = 10, onSite = false) =>
  ({ done, durationMin, driveMin, onSite }) satisfies ProgressStop;
const t = (customer: string, done: boolean, o: Partial<TeamStop> = {}): TeamStop => ({
  customer,
  done,
  durationMin: 30,
  driveMin: 10,
  onSite: false,
  doneAt: null,
  ...o,
});
const day = (done: number, total: number): ProgressStop[] =>
  Array.from({ length: total }, (_, i) => s(i < done));

export const progressCues: ModuleCases = {
  dayProgress: rule(
    (stops: ProgressStop[]) => dayProgress(stops),
    [
      [[]],
      [day(0, 11)],
      [day(1, 11)],
      [day(4, 11)],
      [day(8, 11)],
      [day(9, 11)],
      [day(11, 11)],
      [day(0, 1)],
      [day(1, 1)],
      [day(1, 2)],
      [[s(true), s(false, 45, null), s(false, 20, 15, true)]],
      [[s(true), s(false, 0, null)]],
      [[s(true), s(false, 150, 25), s(false, 150, 40)]],
    ],
  ),
  aboutLabel: rule((min: number) => aboutLabel(min), [[0], [3], [33], [58], [66], [128], [600]]),
  checklistReady: rule(
    (done: number, total: number) => checklistReady(done, total),
    [
      [6, 7],
      [7, 7],
      [0, 0],
      [3, 2],
    ],
  ),
  COMPLETE_READY_LINE: rule(() => COMPLETE_READY_LINE, [[]]),
  techDayProgress: rule(
    (stops: TeamStop[]) => techDayProgress(stops),
    [
      [[]],
      [[t("Ames", false), t("Baker", false)]],
      [[t("Ames", false)]],
      [
        [
          t("Ames", true, { doneAt: "2026-10-22T15:10:00Z" }),
          t("Cole", true, { doneAt: "2026-10-22T16:42:00.123Z" }),
          t("Baker", false),
          t("Diaz", false, { onSite: true }),
          t("Ely", false),
          t("Ford", false),
          t("Gray", false),
          t("Hale", false),
        ],
      ],
      [[t("Ames", true), t("Baker", true), t("Cole", false)]],
      [[t("Ames", true, { doneAt: "2026-10-22T15:00:00Z" }), t("Baker", true)]],
      [[t("Ames", true), t("Baker", true, { doneAt: "2026-10-22T15:00:00+00:00" })]],
      [[t("Ames", true, { doneAt: "2026-10-22T15:00:00Z" }), t("Baker", false, { onSite: true })]],
      [[t("Ames", true), t("Baker", true)]],
    ],
  ),
  lastDoneLine: rule(
    (customer: string, time: string | null) => lastDoneLine(customer, time),
    [
      ["Baker", "10:42 AM"],
      ["Baker", null],
    ],
  ),
  TEAM_TODAY_TITLE: rule(() => TEAM_TODAY_TITLE, [[]]),
};
