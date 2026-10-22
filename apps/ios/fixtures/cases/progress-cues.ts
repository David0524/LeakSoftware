import {
  COMPLETE_READY_LINE,
  aboutLabel,
  checklistReady,
  dayProgress,
  type ProgressStop,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// progress-cues.ts (owner, 2026-10-22): Today's ring, and Mark Complete as the last thing.

const s = (done: boolean, durationMin = 30, driveMin: number | null = 10, onSite = false) =>
  ({ done, durationMin, driveMin, onSite }) satisfies ProgressStop;
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
};
