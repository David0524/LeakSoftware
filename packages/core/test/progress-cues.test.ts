import { describe, expect, it } from "vitest";
import {
  COMPLETE_READY_LINE,
  aboutLabel,
  checklistReady,
  dayProgress,
  type ProgressStop,
} from "../src";

const stop = (done: boolean, o: Partial<ProgressStop> = {}): ProgressStop => ({
  done,
  durationMin: 30,
  driveMin: 10,
  ...o,
});
const day = (done: number, total: number) =>
  Array.from({ length: total }, (_, i) => stop(i < done));

describe("the day's ring", () => {
  it("keeps the plan line before the first stop is done", () => {
    const p = dayProgress(day(0, 11));
    expect(p).toMatchObject({ state: "start", text: null, fraction: 0, left: 11 });
    expect(p.spoken).toBe("0 of 11 stops done");
  });

  it("counts up while many stops are left", () => {
    const p = dayProgress(day(4, 11));
    expect(p).toMatchObject({ state: "going", text: "4 of 11 stops", done: 4, total: 11 });
    expect(p.fraction).toBeCloseTo(4 / 11);
  });

  it("counts down the last few, with the time they take", () => {
    // Two stops: 30 min at each, 10 min to drive to each.
    expect(dayProgress(day(9, 11))).toMatchObject({
      state: "closing",
      text: "2 left · about 1 hr 15 min",
      spoken: "2 stops left, about 1 hr 15 min",
      minutesLeft: 80,
    });
    // The stop the tech is at has no drive left.
    const onSite = [...day(10, 11).slice(0, 10), stop(false, { onSite: true })];
    expect(dayProgress(onSite).text).toBe("1 left · about 30 min");
    expect(dayProgress(day(8, 11)).text).toBe("3 left · about 2 hr");
    expect(dayProgress(day(7, 11)).state).toBe("going");
  });

  it("fills green when every stop is done", () => {
    expect(dayProgress(day(11, 11))).toMatchObject({
      state: "all_done",
      text: "All 11 done",
      fraction: 1,
    });
  });

  it("rounds the time to what a person would say", () => {
    expect(aboutLabel(0)).toBe("about 5 min");
    expect(aboutLabel(33)).toBe("about 35 min");
    expect(aboutLabel(58)).toBe("about 1 hr");
    expect(aboutLabel(66)).toBe("about 1 hr");
    expect(aboutLabel(128)).toBe("about 2 hr 15 min");
  });
});

describe("Mark Complete as the last thing", () => {
  it("is ready only when every item is done", () => {
    expect(checklistReady(6, 7)).toBe(false);
    expect(checklistReady(7, 7)).toBe(true);
    expect(checklistReady(0, 0)).toBe(false);
    expect(COMPLETE_READY_LINE).toBe("Everything’s checked. Mark it complete.");
  });
});
