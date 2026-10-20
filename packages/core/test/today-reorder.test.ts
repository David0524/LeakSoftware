import { describe, expect, it } from "vitest";
import {
  ROUTING_DEFAULTS,
  changeWithUndo,
  estimateDriveMinutes,
  moveJobChange,
  todayMoveIndex,
  todayMoves,
  todayStopLock,
  zonedMinutesToIso,
  type PlanContext,
  type PlanJob,
  type TodayMoveStop,
} from "../src";

// Today: change the order of stops (docs/plans/today-reorder.md).

const TZ = "America/Phoenix";
const ctx: PlanContext = {
  timeZone: TZ,
  settings: ROUTING_DEFAULTS,
  depot: { lat: 33.44879, lng: -112.07711 },
  today: "2026-10-20",
  nowMin: 7 * 60,
};
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedMinutesToIso("2026-10-20", h! * 60 + m!, TZ);
};
const job = (over: Partial<PlanJob> & { id: string }): PlanJob => ({
  status: "scheduled",
  assigned_user_id: "tony",
  second_tech_id: null,
  scheduled_start: null,
  scheduled_end: null,
  route_order: null,
  arrival_fixed: false,
  property: { latitude: 33.45, longitude: -112.0 },
  ...over,
});
const stop = (id: string, over: Partial<TodayMoveStop> = {}): TodayMoveStop => ({
  id,
  done: false,
  lock: null,
  started: false,
  ...over,
});

describe("todayStopLock", () => {
  it("says why a stop can't move", () => {
    expect(todayStopLock(job({ id: "a" }), TZ)).toBeNull();
    expect(todayStopLock(job({ id: "a", status: "in_progress" }), TZ)).toBe("Started");
    expect(
      todayStopLock(job({ id: "a", arrival_fixed: true, scheduled_start: at("09:00") }), TZ),
    ).toBe("Promised for 9:00 AM");
    expect(todayStopLock(job({ id: "a", second_tech_id: "sam" }), TZ)).toBe("Two techs");
  });
});

describe("todayMoveIndex", () => {
  const day = [stop("a"), stop("b"), stop("c")];

  it("Do Later goes after every stop", () => {
    expect(todayMoveIndex(day, "a", "later")).toBe(2);
    expect(todayMoveIndex(day, "c", "later")).toBeNull();
  });

  it("Move Up and Move Down go one place", () => {
    expect(todayMoveIndex(day, "b", "up")).toBe(0);
    expect(todayMoveIndex(day, "b", "down")).toBe(2);
    expect(todayMoveIndex(day, "a", "down")).toBe(1);
    expect(todayMoveIndex(day, "a", "up")).toBeNull();
    expect(todayMoveIndex(day, "c", "down")).toBeNull();
  });

  it("leaves done stops where they are and keeps the rest below a started one", () => {
    const d = [stop("x", { done: true }), stop("s", { started: true, lock: "Started" }), ...day];
    expect(todayMoveIndex(d, "a", "up")).toBeNull();
    expect(todayMoveIndex(d, "b", "up")).toBe(2);
    expect(todayMoveIndex(d, "a", 0)).toBeNull();
    expect(todayMoveIndex(d, "c", 1)).toBe(2);
    expect(todayMoveIndex(d, "x", "later")).toBeNull();
    expect(todayMoveIndex(d, "s", "later")).toBeNull();
  });

  it("never moves a locked stop, but others pass it", () => {
    const d = [stop("a"), stop("p", { lock: "Promised for 9:00 AM" }), stop("c")];
    expect(todayMoveIndex(d, "p", "down")).toBeNull();
    expect(todayMoveIndex(d, "a", "down")).toBe(1);
    expect(todayMoves(d).get("c")).toEqual({ up: true, down: false, later: false });
  });
});

describe("changeWithUndo", () => {
  it("keeps the saved values of exactly what the move changes", () => {
    const jobs = [
      job({ id: "a", scheduled_start: at("08:00"), scheduled_end: at("09:00"), route_order: 1 }),
      job({ id: "b", scheduled_start: at("10:00"), scheduled_end: at("11:00"), route_order: 2 }),
      job({ id: "c", scheduled_start: at("13:00"), scheduled_end: at("14:00"), route_order: 3 }),
    ];
    const index = todayMoveIndex(
      jobs.map((j) => stop(j.id)),
      "a",
      "later",
    )!;
    const move = moveJobChange(
      ctx,
      {
        job: jobs[0]!,
        tech: "tony",
        date: "2026-10-20",
        index,
        targetDay: jobs,
        fromDay: jobs,
        seesAll: false,
        userId: "tony",
      },
      estimateDriveMinutes,
    );
    expect(move.error).toBeUndefined();
    expect(move.message).toMatch(/^Moved to \d+:\d\d PM/);
    const { updates, undo } = changeWithUndo(move.updates, jobs);
    // b and c keep their times; only their places change.
    expect(updates.find((u) => u.id === "b")).toEqual({ id: "b", route_order: 1 });
    expect(undo.find((u) => u.id === "b")).toEqual({ id: "b", route_order: 2 });
    const a = undo.find((u) => u.id === "a")!;
    expect(a).toEqual({
      id: "a",
      route_order: 1,
      scheduled_start: jobs[0]!.scheduled_start,
      scheduled_end: jobs[0]!.scheduled_end,
    });
    // Every field undo puts back is one the move set.
    for (const u of undo) {
      const set = updates.find((x) => x.id === u.id)!;
      expect(Object.keys(u).sort()).toEqual(Object.keys(set).sort());
    }
  });

  it("leaves out rows that wouldn't change, comparing times as instants", () => {
    const j = job({ id: "a", scheduled_start: "2026-10-20T15:00:00+00:00", route_order: 1 });
    const r = changeWithUndo(
      [{ id: "a", route_order: 1, scheduled_start: "2026-10-20T15:00:00.000Z" }],
      [j],
    );
    expect(r).toEqual({ updates: [], undo: [] });
  });

  it("techs move only their own jobs", () => {
    const jobs = [job({ id: "a" }), job({ id: "b" })];
    const r = moveJobChange(
      ctx,
      {
        job: jobs[0]!,
        tech: "tony",
        date: "2026-10-20",
        index: 1,
        targetDay: jobs,
        fromDay: jobs,
        seesAll: false,
        userId: "sam",
      },
      estimateDriveMinutes,
    );
    expect(r.error).toMatch(/only your own jobs/);
  });
});
