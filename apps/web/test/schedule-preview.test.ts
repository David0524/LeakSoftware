import { describe, expect, it } from "vitest";
import { ROUTING_DEFAULTS } from "@leakbook/core";
import {
  previewDay,
  previewWeek,
  relayout,
  type PreviewContext,
  type PreviewJob,
} from "../src/lib/schedule-preview";

// Optimize and Optimize Week shown at once (owner, 2026-10-22; docs/design/
// 2026-10-22-schedule-hold-drag.md): the new order worked out in the browser.

const ctx: PreviewContext = {
  timeZone: "America/Phoenix",
  settings: ROUTING_DEFAULTS,
  depot: { lat: 33.45, lng: -111.95 },
  today: "2026-10-19",
  nowMin: 7 * 60,
  homes: [],
};
const TECH = "00000000-0000-4000-8000-000000000001";
const DAY = "2026-10-21";

function job(id: string, lat: number, lng: number, hhmm: string, more: Partial<PreviewJob> = {}) {
  const start = `${DAY}T${hhmm}:00-07:00`;
  return {
    id,
    status: "scheduled",
    assigned_user_id: TECH,
    second_tech_id: null,
    scheduled_start: start,
    scheduled_end: new Date(Date.parse(start) + 3_600_000).toISOString(),
    route_order: null,
    arrival_fixed: false,
    lock_day: false,
    lock_time: false,
    service_plan_id: null,
    property: { latitude: lat, longitude: lng },
    ...more,
  } as PreviewJob;
}

// Near, far west, near again: the far stop belongs last (or first), never between.
const near1 = job("a", 33.46, -111.94, "08:00");
const far = job("b", 33.43, -112.39, "10:00");
const near2 = job("c", 33.49, -111.92, "12:00");

describe("previewDay", () => {
  it("orders a day for the least driving and re-times the stops that may move", () => {
    const r = previewDay(ctx, TECH, DAY, [near1, far, near2])!;
    expect(r.order).toHaveLength(3);
    expect(r.order.indexOf("b")).not.toBe(1);
    expect(Object.keys(r.starts).sort()).toEqual(["a", "b", "c"]);
    for (const at of Object.values(r.starts)) expect(at.startsWith(DAY)).toBe(true);
  });

  it("keeps a promised time where it is and doesn't re-time it", () => {
    const fixed = job("c", 33.49, -111.92, "14:00", { arrival_fixed: true });
    const r = previewDay(ctx, TECH, DAY, [near1, far, fixed])!;
    expect(r.starts.c).toBeUndefined();
  });

  it("moves shared stops only for owners and admins with the other tech's day on the page", () => {
    // Owner, 2026-10-24: Optimize may move a shared job when it fits the second tech's day.
    const JAKE = "00000000-0000-4000-8000-000000000002";
    const day = [near1, far, near2].map((j) => ({ ...j, second_tech_id: JAKE }));
    const owner = previewDay({ ...ctx, partners: true }, TECH, DAY, day, () => day)!;
    expect(owner.order.indexOf("b")).not.toBe(1);
    expect(Object.keys(owner.starts).sort()).toEqual(["a", "b", "c"]);
    // A tech, or Jake's day not on the page: the shared stops keep their times and order.
    for (const r of [
      previewDay(ctx, TECH, DAY, day, () => day)!,
      previewDay({ ...ctx, partners: true }, TECH, DAY, day, () => null)!,
    ]) {
      expect(r.order).toEqual(["a", "b", "c"]);
      expect(r.starts).toEqual({});
    }
  });

  it("has nothing to do for a past day or a single stop", () => {
    expect(previewDay(ctx, TECH, "2026-10-01", [near1, far])).toBeNull();
    expect(previewDay(ctx, TECH, DAY, [near1])).toBeNull();
  });
});

describe("previewWeek", () => {
  it("places a waiting job on a work day for the tech", () => {
    const waiting = {
      ...job("w", 33.47, -111.93, "08:00"),
      assigned_user_id: TECH,
      scheduled_start: null,
      scheduled_end: null,
      status: "unscheduled",
    } as PreviewJob;
    const r = previewWeek({
      ctx,
      dates: ["2026-10-20", DAY],
      techs: "all",
      tray: true,
      team: [TECH],
      dayJobs: (_t, d) => (d === DAY ? [near1, far] : []),
      waiting: [waiting],
    });
    const w = r.updates.find((u) => u.id === "w")!;
    expect(w.assigned_user_id).toBe(TECH);
    expect(w.status).toBe("scheduled");
    expect(w.scheduled_start).toBeTruthy();
    expect(r.message).toBeTruthy();
  });

  it("does nothing with no work days left", () => {
    const r = previewWeek({
      ctx,
      dates: ["2026-10-01"],
      techs: [TECH],
      tray: true,
      team: [TECH],
      dayJobs: () => [near1],
      waiting: [],
    });
    expect(r.updates).toEqual([]);
  });
});

describe("relayout", () => {
  const key = `${TECH}|${DAY}`;
  const other = `${TECH}|2026-10-22`;
  const lists = {
    tray: [{ id: "t", key: "tray", tech: null, date: null }],
    [key]: ["a", "b", "c"].map((id) => ({ id, key, tech: TECH, date: DAY })),
    [other]: [],
  };

  it("puts a day in its new order", () => {
    const r = relayout(
      lists,
      [
        { id: "c", route_order: 1 },
        { id: "a", route_order: 2 },
        { id: "b", route_order: 3 },
      ],
      ctx.timeZone,
      "tray",
    )!;
    expect(r[key]).toEqual(["c", "a", "b"]);
  });

  it("moves a stop to the day of its new time, and one without a tech to Needs a Time", () => {
    const r = relayout(
      lists,
      [
        {
          id: "t",
          assigned_user_id: TECH,
          scheduled_start: "2026-10-22T08:00:00-07:00",
          route_order: 1,
        },
        { id: "b", assigned_user_id: null },
      ],
      ctx.timeZone,
      "tray",
    )!;
    expect(r[other]).toEqual(["t"]);
    expect(r.tray).toEqual(["b"]);
    expect(r[key]).toEqual(["a", "c"]);
  });

  it("keeps a stop where it is when its new day isn't on the board", () => {
    const r = relayout(
      lists,
      [{ id: "a", scheduled_start: "2027-01-05T08:00:00-07:00" }],
      ctx.timeZone,
      "tray",
    )!;
    expect(r[key]).toEqual(["a", "b", "c"]);
  });

  it("is nothing when no row touches the board", () => {
    expect(relayout(lists, [{ id: "zz", route_order: 1 }], ctx.timeZone, "tray")).toBeNull();
  });
});
