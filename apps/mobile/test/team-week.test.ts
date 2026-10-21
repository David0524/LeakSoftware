import { describe, expect, it } from "vitest";
import { PLAN_MOVE_CHOICES, teamOrder } from "@leakbook/core";
import {
  changeSchedule,
  justThisVisit,
  moveAsks,
  takesOffPlan,
  undoChanges,
  visitSlot,
} from "../src/lib/planMove";
import { planDrop, type DropZone } from "../src/lib/scheduleDrag";
import type { PlanRow } from "../src/lib/serviceRoutes";

// Team colors, Week with routes and plan visits that keep their day (owner, 2026-10-20;
// docs/design/2026-10-20-team-week.md), as Android does them.

const TZ = "America/Phoenix";
const today = "2026-10-20"; // a Tuesday
const LUIS = "u-luis";
const PRIYA = "u-priya";

const visit = (over: Record<string, unknown> = {}) => ({
  id: "v1",
  status: "scheduled",
  service_plan_id: "p1",
  plan_moved: false,
  // Wednesday 2026-10-21, 9 AM in Phoenix.
  scheduled_start: "2026-10-21T16:00:00Z",
  assigned_user_id: LUIS,
  customer: { name: "Rivera" },
  ...over,
});

const weekly: PlanRow = {
  id: "p1",
  customer_id: "c1",
  property_id: "pr1",
  starts_on: "2026-10-07",
  interval_weeks: 1,
  weekdays: null,
  ends_on: null,
  paused: false,
  duration_minutes: 30,
  assigned_user_id: LUIS,
};

describe("moving a plan's visit asks first", () => {
  it("asks for another day or another tech, never for a new place the same day", () => {
    const v = visit();
    expect(visitSlot(v, TZ)).toEqual({ date: "2026-10-21", techId: LUIS });
    expect(moveAsks(v, { tech: LUIS, date: "2026-10-22" }, TZ)).not.toBeNull();
    expect(moveAsks(v, { tech: PRIYA, date: "2026-10-21" }, TZ)).not.toBeNull();
    expect(moveAsks(v, { tech: LUIS, date: "2026-10-21" }, TZ)).toBeNull();
  });
  it("doesn't ask for a job without a plan, a started visit, or taking it off the schedule", () => {
    expect(
      moveAsks(visit({ service_plan_id: null }), { tech: LUIS, date: "2026-10-22" }, TZ),
    ).toBeNull();
    expect(
      moveAsks(visit({ status: "in_progress" }), { tech: LUIS, date: "2026-10-22" }, TZ),
    ).toBeNull();
    expect(moveAsks(visit(), { tech: null, date: null }, TZ)).toBeNull();
  });
  it("uses the shared words", () => {
    expect(PLAN_MOVE_CHOICES.title("Rivera")).toMatch(/^Move Rivera.s visits\?$/);
    expect([PLAN_MOVE_CHOICES.changeSchedule, PLAN_MOVE_CHOICES.justThisVisit]).toEqual([
      "Change Schedule",
      "Just This Visit",
    ]);
  });
});

describe("taking a plan visit off the schedule", () => {
  it("is a one-off: no question, the visit marked moved", () => {
    const off = { tech: null, date: null };
    expect(takesOffPlan(visit(), off, TZ)).toBe(true);
    expect(takesOffPlan(visit({ service_plan_id: null }), off, TZ)).toBe(false);
    expect(takesOffPlan(visit({ status: "unscheduled" }), off, TZ)).toBe(false);
    expect(takesOffPlan(visit(), { tech: LUIS, date: "2026-10-22" }, TZ)).toBe(false);
    // The Move sheet's "Nobody yet" keeps the day but is the same one-off.
    expect(takesOffPlan(visit(), { tech: null, date: "2026-10-22" }, TZ)).toBe(true);
    const updates = justThisVisit(
      [{ id: "v1", status: "unscheduled", scheduled_start: null }],
      "v1",
    );
    expect(updates[0]).toMatchObject({ plan_moved: true, status: "unscheduled" });
    expect(
      undoChanges(updates, () => ({
        status: "scheduled",
        scheduled_start: "2026-10-21T16:00:00Z",
        plan_moved: false,
      })),
    ).toEqual([
      { id: "v1", status: "scheduled", scheduled_start: "2026-10-21T16:00:00Z", plan_moved: false },
    ]);
  });
});

describe("Change Schedule moves the plan", () => {
  it("puts a weekly plan on the new weekday with the new tech, and Undo puts it back", () => {
    const slots = moveAsks(visit(), { tech: PRIYA, date: "2026-10-23" }, TZ)!;
    const c = changeSchedule(weekly, slots, today);
    expect(c.weekday).toBe("Friday");
    expect(c.write).toMatchObject({ id: "p1", assigned_user_id: PRIYA, weekdays: null });
    expect(new Date(`${c.write.starts_on}T12:00:00Z`).getUTCDay()).toBe(5);
    expect(c.write.starts_on >= today).toBe(true);
    expect(c.undo).toEqual({
      id: "p1",
      starts_on: "2026-10-07",
      weekdays: null,
      assigned_user_id: LUIS,
    });
  });
  it("keeps the plan's tech when only the day changes", () => {
    const slots = moveAsks(visit(), { tech: LUIS, date: "2026-10-22" }, TZ)!;
    expect(changeSchedule(weekly, slots, today).write.assigned_user_id).toBe(LUIS);
  });
  it("swaps only the visit's day on a plan with several days a week", () => {
    const slots = moveAsks(visit(), { tech: LUIS, date: "2026-10-22" }, TZ)!;
    const c = changeSchedule({ ...weekly, weekdays: [1, 3] }, slots, today);
    expect(c.write.weekdays).toEqual([1, 4]);
  });
});

describe("Just This Visit moves one visit", () => {
  it("marks the moved visit, and Undo restores every changed column", () => {
    const updates = justThisVisit(
      [
        { id: "v1", scheduled_start: "2026-10-22T16:00:00Z", route_order: 2 },
        { id: "v2", route_order: 1 },
      ],
      "v1",
    );
    expect(updates[0]).toMatchObject({ id: "v1", plan_moved: true });
    expect(updates[1]).not.toHaveProperty("plan_moved");
    const before: Record<string, Record<string, unknown>> = {
      v1: { scheduled_start: "2026-10-21T16:00:00Z", route_order: 4, plan_moved: false },
      v2: { route_order: 3 },
    };
    expect(undoChanges(updates, (id) => before[id])).toEqual([
      { id: "v1", scheduled_start: "2026-10-21T16:00:00Z", route_order: 4, plan_moved: false },
      { id: "v2", route_order: 3 },
    ]);
  });
  it("marks the visit even when the move changed none of its columns", () => {
    expect(justThisVisit([{ id: "v2", route_order: 1 }], "v1")).toContainEqual({
      id: "v1",
      plan_moved: true,
    });
  });
});

describe("Customers to Add drag onto a tech's day", () => {
  const rect = { x: 0, y: 0, width: 300, height: 200 };
  const route = (date: string): DropZone => ({
    kind: "route",
    id: `${PRIYA}|${date}`,
    tech: PRIYA,
    date,
    open: date >= today,
    rect,
  });
  const item = { id: "p9", status: "scheduled", from: { kind: "plan" as const } };
  it("goes to that tech on that date's weekday, a past day included", () => {
    const at = { item, index: 0, today, fallbackTech: null };
    expect(planDrop({ ...at, zone: route("2026-10-23") })).toEqual({
      kind: "plan",
      tech: PRIYA,
      date: "2026-10-23",
    });
    expect(planDrop({ ...at, zone: route("2026-10-19") }).kind).toBe("plan");
  });
  it("does nothing on Needs a Time or nowhere", () => {
    const at = { item, index: 0, today, fallbackTech: null };
    expect(planDrop({ ...at, zone: { kind: "tray", id: "tray", rect } }).kind).toBe("none");
    expect(planDrop({ ...at, zone: null }).kind).toBe("none");
  });
});

describe("Team's one list", () => {
  it("lists the active A to Z, then those turned off, most recent first", () => {
    const m = (name: string, status: string, disabled_at: string | null = null) => ({
      name,
      status,
      disabled_at,
    });
    const { active, off } = teamOrder([
      m("Tony", "active"),
      m("Jake", "disabled", "2026-10-01T00:00:00Z"),
      m("Dana", "active"),
      m("Ann", "disabled", "2026-10-18T00:00:00Z"),
    ]);
    expect(active.map((x) => x.name)).toEqual(["Dana", "Tony"]);
    expect(off.map((x) => x.name)).toEqual(["Ann", "Jake"]);
  });
});
