import { describe, expect, it } from "vitest";

// Routes on Android (owner, 2026-10-20, docs/plans/route-maps.md part 3): the website's
// test/service-routes.test.ts cases, plus the phone's own parts (plans from local rows, the
// columns a move saves, drag and drop onto a day, and the words).
import {
  customersToAdd,
  daySummary,
  firstTech,
  leftOutNote,
  movePlan,
  movedMessage,
  rebuildPlans,
  repeatNote,
  routeDay,
  routeDays,
  withSuggestions,
  dayAt,
  dayDetail,
  emptyDay,
  keptMessage,
  moveHint,
  moveWrite,
  multiDayNote,
  nothingSuggested,
  planDayDrop,
  routeCards,
  searchCards,
  segmentLabel,
  undoRow,
  type PlanRow,
  type RoutePlanCard,
} from "../src/lib/serviceRoutes";

const shop = { lat: 33.45, lng: -112.07 };
const day = { startMin: 8 * 60, endMin: 17 * 60 };
const T1 = "tech-1";
const T2 = "tech-2";

const plan = (id: string, over: Partial<RoutePlanCard> = {}): RoutePlanCard => ({
  planId: id,
  customer: `Customer ${id}`,
  address: `${id} Main St`,
  location: { lat: 33.45, lng: -112.07 },
  techId: T1,
  days: [1],
  durationMin: 30,
  repeat: "weekly",
  createdAt: "2026-10-01T00:00:00Z",
  ...over,
});

describe("Customers to Add", () => {
  const list = [
    plan("a", { techId: null, customer: "Abraham, Ezra", createdAt: "2026-10-01T00:00:00Z" }),
    plan("b", { techId: null, customer: "Barber, Dale", createdAt: "2026-10-05T00:00:00Z" }),
    plan("c", { techId: T1 }),
    plan("d", { techId: "gone", customer: "Perry, Tyler", createdAt: "2026-09-01T00:00:00Z" }),
  ];

  it("lists plans with nobody on them (or someone who left), newest first", () => {
    expect(customersToAdd(list, [T1, T2]).map((p) => p.planId)).toEqual(["b", "a", "d"]);
  });

  it("searches names and addresses, every word", () => {
    expect(customersToAdd(list, [T1], "ezra").map((p) => p.planId)).toEqual(["a"]);
    expect(customersToAdd(list, [T1], "main barb").map((p) => p.planId)).toEqual(["b"]);
    expect(customersToAdd(list, [T1], "nobody")).toEqual([]);
  });
});

describe("whose routes", () => {
  it("opens on the asked-for tech, else the first with plans", () => {
    const plans = [plan("a", { techId: T2 })];
    expect(firstTech(plans, [T1, T2], T1)).toBe(T1);
    expect(firstTech(plans, [T1, T2], "someone-else")).toBe(T2);
    expect(firstTech([], [T1, T2])).toBe(T1);
    expect(firstTech([], [])).toBeNull();
  });

  it("shows the working days, Monday first, plus any day the tech has plans on", () => {
    const plans = [plan("a", { days: [6] }), plan("b", { techId: T2, days: [0] })];
    expect(routeDays(plans, T1, [1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5, 6]);
    expect(routeDays(plans, T2, [5, 1])).toEqual([1, 5, 0]);
  });
});

describe("a tech's weekday", () => {
  it("orders the pools for the least driving, with the unmapped ones last", () => {
    // In name order the day zigzags east, west, east: driving order keeps the east pools
    // together.
    const east1 = plan("e1", { location: { lat: 33.45, lng: -111.8 }, customer: "A east" });
    const west = plan("w", { location: { lat: 33.45, lng: -112.35 }, customer: "B west" });
    const east2 = plan("e2", { location: { lat: 33.47, lng: -111.78 }, customer: "C east" });
    const lost = plan("lost", { location: null, customer: "D lost" });
    const other = plan("other", { days: [2] });
    const r = routeDay({
      plans: [east1, lost, west, east2, other],
      tech: T1,
      day: 1,
      depot: shop,
      workDay: day,
    });
    const order = r.plans.map((p) => p.planId);
    expect(order).toHaveLength(4);
    expect(order[3]).toBe("lost");
    expect(order.indexOf("w")).not.toBe(1);
    expect(r.serviceMin).toBe(120);
    expect(r.driveMin).toBeGreaterThan(0);
    expect(r.missing).toBe(1);
    // The shop and three numbered pins in driving order.
    expect(r.pins).toMatch(/^s:33\.45000,-112\.07000;t1:.*;t2:.*;t3:[^;]*$/);
    expect(daySummary(r)).toMatch(/^4 pools · \d+ hr( \d+ min)?$/);
  });

  it("says when the day runs past its end, and nothing for an empty day", () => {
    const long = Array.from({ length: 10 }, (_, i) => plan(String(i), { durationMin: 60 }));
    const r = routeDay({ plans: long, tech: T1, day: 1, depot: shop, workDay: day });
    expect(r.overMin).toBeGreaterThanOrEqual(60);
    const empty = routeDay({ plans: long, tech: T2, day: 1, depot: shop, workDay: day });
    expect(empty.plans).toEqual([]);
    expect(empty.pins).toBeNull();
    expect(daySummary(empty)).toBeNull();
  });
});

describe("moving and suggesting", () => {
  it("moves one day of a plan on several days, or the only day, and sets the tech", () => {
    expect(movePlan(plan("a", { days: [1, 4] }), { from: 4, to: 2, tech: T2 })).toMatchObject({
      days: [1, 2],
      techId: T2,
    });
    expect(
      movePlan(plan("a", { techId: null, days: [3] }), { from: null, to: 2, tech: T1 }),
    ).toMatchObject({ days: [2], techId: T1 });
  });

  it("says where it went", () => {
    expect(movedMessage(2)).toBe("Moved to Tuesday. Its coming visits moved too.");
  });

  it("notes plans not serviced once a week", () => {
    expect(repeatNote(plan("a", { days: [1, 4] }))).toBe("2× a week");
    expect(repeatNote(plan("a", { repeat: "biweekly" }))).toBe("Every 2 weeks");
    expect(repeatNote(plan("a", { repeat: "monthly" }))).toBe("Monthly");
    expect(repeatNote(plan("a"))).toBeNull();
  });

  it("puts suggestions in place without touching the rest", () => {
    const plans = [plan("a", { techId: null, days: [0] }), plan("b")];
    const out = withSuggestions(plans, [{ id: "a", techId: T2, day: 3 }]);
    expect(out[0]).toMatchObject({ techId: T2, days: [3] });
    expect(out[1]).toBe(plans[1]);
  });

  it("explains what Suggest Days left out", () => {
    const plans = [
      plan("a", { location: null }),
      plan("b", { location: null }),
      plan("c", { days: [1, 3] }),
      plan("d"),
    ];
    expect(leftOutNote(plans, ["a", "b", "c", "d"])).toBe(
      "2 have no map location · 1 is on several days a week · 1 didn’t fit",
    );
    expect(leftOutNote(plans, ["a"])).toBe("1 has no map location");
    expect(leftOutNote(plans, [])).toBeNull();
  });

  it("rebuilds a tech's single-day plans only", () => {
    const plans = [plan("a"), plan("b", { days: [1, 3] }), plan("c", { techId: T2 })];
    expect(rebuildPlans(plans, T1).map((p) => p.planId)).toEqual(["a"]);
  });
});

describe("on the phone", () => {
  const row = (over: Partial<PlanRow> = {}): PlanRow => ({
    id: "p1",
    customer_id: "c1",
    property_id: "pr1",
    starts_on: "2026-10-19", // a Monday
    interval_weeks: 1,
    weekdays: null,
    ends_on: null,
    paused: false,
    duration_minutes: 30,
    assigned_user_id: T1,
    monthly: false,
    created_at: "2026-10-01T00:00:00Z",
    ...over,
  });

  it("builds cards from the running plans only", () => {
    const cards = routeCards({
      plans: [
        row(),
        row({ id: "paused", paused: true }),
        row({ id: "ended", ends_on: "2026-10-01" }),
        row({ id: "gone", deleted_at: "2026-10-02T00:00:00Z" }),
        row({ id: "p2", property_id: "none", weekdays: [1, 4], customer_id: "c2" }),
      ],
      customers: new Map([
        ["c1", { name: "Perry, Tyler" }],
        ["c2", { name: null }],
      ]),
      properties: new Map([
        ["pr1", { address_line1: "1 Main St", city: "Mesa", latitude: 33.4, longitude: -111.8 }],
      ]),
      today: "2026-10-20",
    });
    expect(cards.map((c) => c.planId)).toEqual(["p2", "p1"]);
    expect(cards[1]).toMatchObject({
      customer: "Perry, Tyler",
      address: "1 Main St, Mesa",
      location: { lat: 33.4, lng: -111.8 },
      days: [1],
      repeat: "weekly",
    });
    expect(cards[0]).toMatchObject({
      customer: "Customer",
      address: "",
      location: null,
      days: [1, 4],
    });
  });

  it("saves the moved day and tech, and keeps what to put back", () => {
    const p = row();
    expect(moveWrite(p, { from: 1, to: 2, tech: T2 }, "2026-10-20")).toEqual({
      id: "p1",
      starts_on: "2026-10-20",
      weekdays: null,
      assigned_user_id: T2,
    });
    // Several days a week: only that day swaps.
    expect(
      moveWrite(row({ weekdays: [1, 4] }), { from: 1, to: 3, tech: T1 }, "2026-10-20"),
    ).toMatchObject({ weekdays: [3, 4], starts_on: "2026-10-19" });
    // From Customers to Add (no day picked): its first day moves.
    expect(moveWrite(p, { from: null, to: 5, tech: T1 }, "2026-10-20").starts_on).toBe(
      "2026-10-23",
    );
    expect(undoRow(p)).toEqual({
      id: "p1",
      starts_on: "2026-10-19",
      weekdays: null,
      assigned_user_id: T1,
    });
  });

  it("decides what a drop on a day does", () => {
    const p = plan("a", { days: [1, 4] });
    expect(planDayDrop({ plan: p, from: 1, to: null, tech: T1 })).toEqual({ kind: "none" });
    expect(planDayDrop({ plan: p, from: 1, to: 1, tech: T1 })).toEqual({ kind: "none" });
    expect(planDayDrop({ plan: p, from: 1, to: 4, tech: T1 })).toEqual({
      kind: "refuse",
      error: "Customer a is already serviced on Thursday.",
    });
    expect(planDayDrop({ plan: p, from: 1, to: 2, tech: T1 })).toEqual({
      kind: "move",
      from: 1,
      to: 2,
      tech: T1,
    });
    // Same day, another tech: a move.
    expect(planDayDrop({ plan: p, from: 1, to: 1, tech: T2 }).kind).toBe("move");
    // From Customers to Add.
    expect(
      planDayDrop({ plan: plan("b", { techId: null }), from: null, to: 3, tech: T1 }),
    ).toMatchObject({ kind: "move", from: null, to: 3 });
  });

  it("finds the day segment under the finger", () => {
    const zones = [
      { day: 1, rect: { x: 0, y: 100, width: 60, height: 48 } },
      { day: 2, rect: { x: 62, y: 100, width: 60, height: 48 } },
    ];
    expect(dayAt(zones, 70, 120)).toBe(2);
    expect(dayAt(zones, 10, 99)).toBeNull();
  });

  it("words the segments, the Move sheet and the results", () => {
    expect(segmentLabel({ day: 1, plans: [plan("a"), plan("b")] })).toBe("Monday, 2 pools");
    expect(segmentLabel({ day: 2, plans: [plan("a")] })).toBe("Tuesday, 1 pool");
    expect(emptyDay(2)).toBe("No pools on Tuesday yet.");
    expect(multiDayNote([1, 4], 1)).toBe("Moves its Monday visit. Thursday stays.");
    expect(multiDayNote([1, 3, 5], 1)).toBe("Moves its Monday visit. Wednesday and Friday stay.");
    expect(multiDayNote([1], 1)).toBeNull();
    expect(multiDayNote([1, 4], null)).toBeNull();
    expect(moveHint(false, 2)).toBe("Its coming visits move to the new day.");
    expect(moveHint(true, 4)).toBe("It’s already serviced on Thursday.");
    expect(keptMessage(1)).toBe("Saved 1 customer’s day. Their coming visits moved too.");
    expect(keptMessage(12)).toBe("Saved 12 customers’ days. Their coming visits moved too.");
    expect(nothingSuggested("2 have no map location")).toBe(
      "No days to suggest: 2 have no map location.",
    );
    expect(nothingSuggested(null)).toBe("No days to suggest.");
    expect(dayDetail({ serviceMin: 90, driveMin: 25 })).toBe(
      "1 hr 30 min at pools, about 25 min driving",
    );
  });

  it("searches Customers to Add in place", () => {
    const list = [plan("a", { customer: "Abraham, Ezra" }), plan("b", { customer: "Barber" })];
    expect(searchCards(list, "  ").length).toBe(2);
    expect(searchCards(list, "ezra").map((p) => p.planId)).toEqual(["a"]);
    expect(searchCards(list, "barber main").map((p) => p.planId)).toEqual(["b"]);
  });
});
