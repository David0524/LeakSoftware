import { describe, expect, it } from "vitest";
import {
  estimateDriveMinutes,
  planDay,
  routingSettings,
  zonedTimeToIso,
  type PlanContext,
  type PlanJob,
} from "@leakbook/core";
import {
  ALREADY_BEST,
  OPTIMIZE_PUT_BACK,
  PLAN_WEEK_KEPT,
  optimizeManyText,
  optimizeOutcome,
  partnerDays,
} from "../src/features/schedule/optimize";
import { STOP_HOLD_MS } from "../src/lib/scheduleDrag";

// Optimize with Undo and hold-to-drag on Android (owner, 2026-10-22;
// docs/design/2026-10-22-schedule-hold-drag.md), as the website and the iPhone app.

const tz = "America/Phoenix";
const DAY = "2026-10-21";
const TECH = "00000000-0000-4000-8000-000000000001";
const ctx: PlanContext = {
  timeZone: tz,
  settings: routingSettings({}),
  depot: { lat: 33.45, lng: -111.95 },
  today: "2026-10-19",
  nowMin: 7 * 60,
};

function job(id: string, lat: number, lng: number, time: string, order: number): PlanJob {
  const start = zonedTimeToIso(DAY, time, tz);
  return {
    id,
    status: "scheduled",
    assigned_user_id: TECH,
    second_tech_id: null,
    scheduled_start: start,
    scheduled_end: new Date(Date.parse(start) + 3_600_000).toISOString(),
    route_order: order,
    arrival_fixed: false,
    lock_day: false,
    lock_time: false,
    property: { latitude: lat, longitude: lng },
  } as PlanJob;
}

describe("Optimize with Undo", () => {
  // Near, far west, near again: booked in a poor order.
  const day = [
    job("a", 33.46, -111.94, "08:00", 1),
    job("b", 33.43, -112.39, "10:00", 2),
    job("c", 33.49, -111.92, "12:00", 3),
  ];

  it("saves the new order with the saved values for Undo", () => {
    const out = optimizeOutcome(planDay(ctx, TECH, DAY, day, estimateDriveMinutes), day);
    expect(out.error).toBeUndefined();
    expect(out.message).toMatch(/^Optimized · /);
    expect(out.updates.length).toBeGreaterThan(0);
    // Undo puts back exactly what changed.
    expect(out.undo.map((u) => u.id).sort()).toEqual(out.updates.map((u) => u.id).sort());
    for (const u of out.undo) {
      const was = day.find((j) => j.id === u.id)!;
      if ("route_order" in u) expect(u.route_order).toBe(was.route_order);
    }
  });

  it("says Already the best order, with nothing to undo, when the order stays", () => {
    const first = optimizeOutcome(planDay(ctx, TECH, DAY, day, estimateDriveMinutes), day);
    const after = day
      .map((j) => {
        const u = first.updates.find((x) => x.id === j.id);
        return { ...j, ...u } as PlanJob;
      })
      .sort((x, y) => (x.route_order ?? 0) - (y.route_order ?? 0));
    const again = optimizeOutcome(planDay(ctx, TECH, DAY, after, estimateDriveMinutes), after);
    expect(again.message).toBe(ALREADY_BEST);
    expect(again.undo).toEqual([]);
  });

  it("passes a refusal through", () => {
    const out = optimizeOutcome(planDay(ctx, TECH, "2026-10-01", day, estimateDriveMinutes), day);
    expect(out.error).toBe("Past days can’t be planned.");
    expect(out.updates).toEqual([]);
  });

  it("words a failed save the same on every platform", () => {
    expect(OPTIMIZE_PUT_BACK).toBe("The order is as it was.");
    expect(PLAN_WEEK_KEPT).toBe("The week is as it was.");
  });
});

describe("Optimize with shared jobs (owner, 2026-10-24)", () => {
  const JAKE = "00000000-0000-4000-8000-000000000002";
  const names = { [TECH]: "Dana Owner", [JAKE]: "Jake Turner" };
  // The same poor order, every stop with Jake as second tech.
  const day = [
    job("a", 33.46, -111.94, "08:00", 1),
    job("b", 33.43, -112.39, "10:00", 2),
    job("c", 33.49, -111.92, "12:00", 3),
  ].map((j) => ({ ...j, second_tech_id: JAKE }));
  const plan = (manager: boolean) =>
    optimizeOutcome(
      planDay(ctx, TECH, DAY, day, estimateDriveMinutes, {
        partners: partnerDays(manager, TECH, day, () => day),
        names,
      }),
      day,
    );

  it("moves shared stops for an owner when the second tech's day allows it", () => {
    const out = plan(true);
    expect(out.message).toMatch(/^Optimized · .+ less driving$/);
    expect(out.undo.length).toBeGreaterThan(0);
  });

  it("says why nothing moved when the second tech's day isn't known", () => {
    const out = plan(false);
    expect(out.message).toBe(
      "No change: all 3 stops are shared with Jake Turner, so their times stay.",
    );
    expect(out.undo).toEqual([]);
  });

  it("finds each other tech once, never this one", () => {
    expect(partnerDays(true, TECH, day, () => [])).toEqual([{ techId: JAKE, jobs: [] }]);
    expect(partnerDays(true, JAKE, day, () => [])).toEqual([{ techId: TECH, jobs: [] }]);
    expect(partnerDays(false, TECH, day, () => [])).toEqual([]);
  });

  it("words several routes at once", () => {
    const best = { message: ALREADY_BEST, updates: [], undo: [] };
    const kept = {
      message: "No change: all 3 stops are shared with Jake Turner, so their times stay.",
      updates: [],
      undo: [],
    };
    const moved = { message: "Optimized · 5 min less driving", updates: [], undo: [{ id: "a" }] };
    expect(optimizeManyText([best, best], "Optimized 2 routes.")).toEqual({
      message: ALREADY_BEST,
    });
    expect(optimizeManyText([best, kept], "Optimized 2 routes.")).toEqual({
      message: "No change",
      detail: "All 3 stops are shared with Jake Turner, so their times stay.",
    });
    expect(optimizeManyText([moved, kept], "Optimized 2 routes.")).toEqual({
      message: "Optimized 2 routes.",
    });
  });
});

describe("hold to drag", () => {
  it("lifts a stop's tile after a 0.4 s touch and hold", () => {
    expect(STOP_HOLD_MS).toBe(400);
  });
});
