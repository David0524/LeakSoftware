import { describe, expect, it } from "vitest";
import { heroActions, todayHero } from "@leakbook/core";
import {
  checklistCount,
  heroStops,
  onMyWayValues,
  startJobValues,
  todayList,
  type HeroSource,
} from "../src/lib/todayHero";

// Today's card for the stop you're on (owner, 2026-10-20; docs/plans/today-hero.md): the card
// and the current-stop notification feed core todayHero from the same stops.

const TZ = "America/Phoenix";
const today = "2026-10-20";
const job = (id: string, over: Partial<HeroSource> = {}): HeroSource => ({
  id,
  type: "detection",
  status: "scheduled",
  scheduled_start: "2026-10-20T16:00:00Z", // 9:00 AM in Phoenix
  customer: { name: `Customer ${id}` },
  property: { address_line1: `${id} Palm Ln`, access_notes: null },
  ...over,
});

describe("heroStops", () => {
  it("reads the customer, street and access notes, and only the counted stop's checklist", () => {
    const s = heroStops(
      [
        job("a", { property: { address_line1: "1 Palm Ln", access_notes: "Gate 4821" } }),
        job("b", { customer: null, property: null }),
      ],
      new Map([["a", { done: 4, total: 9 }]]),
    );
    expect(s[0]).toMatchObject({
      customer: "Customer a",
      address: "1 Palm Ln",
      access: "Gate 4821",
      checklistDone: 4,
      checklistTotal: 9,
    });
    expect(s[1]).toMatchObject({ customer: "Customer", address: null, checklistTotal: 0 });
  });
});

describe("On My Way on the job", () => {
  it("keeps when it was sent and the arrival, at least 5 minutes out", () => {
    const now = new Date("2026-10-20T16:00:00Z");
    expect(onMyWayValues(now, 14)).toEqual({
      on_my_way_at: "2026-10-20T16:00:00.000Z",
      arrive_at: "2026-10-20T16:14:00.000Z",
    });
    expect(onMyWayValues(now, 0).arrive_at).toBe("2026-10-20T16:05:00.000Z");
  });

  it("puts that stop on the way on the card, on any phone that has the job", () => {
    const now = new Date("2026-10-20T16:30:00Z");
    const stops = [job("a"), job("b", onMyWayValues(now, 12))];
    const h = todayHero({ stops: heroStops(stops), today, timeZone: TZ })!;
    expect(h.moment).toBe("driving");
    expect(h.stopId).toBe("b");
    expect([h.content.figure, h.content.figureLabel]).toEqual(["9:42 AM", "Arriving"]);
    expect(heroActions(h.moment, true).primary).toBe("start_job");
    // Someone looking at the tech's day doesn't get Start Job.
    expect(heroActions(h.moment, false).primary).toBeNull();
  });

  it("from yesterday doesn't count", () => {
    const stops = [job("a"), job("b", onMyWayValues(new Date("2026-10-19T16:00:00Z"), 10))];
    expect(todayHero({ stops: heroStops(stops), today, timeZone: TZ })!.stopId).toBe("a");
  });
});

describe("Start Job from the card", () => {
  it("starts the job and keeps an earlier start time", () => {
    const now = new Date("2026-10-20T16:45:00Z");
    expect(startJobValues({ started_at: null }, now)).toEqual({
      status: "in_progress",
      started_at: "2026-10-20T16:45:00.000Z",
    });
    expect(startJobValues({ started_at: "2026-10-20T15:00:00Z" }, now)).toEqual({
      status: "in_progress",
    });
  });
});

describe("checklistCount", () => {
  const tally = { pass: 3, attention: 1, leaking: 0, notApplicable: 1, pending: 4 };
  it("counts every checklist row on a leak job", () => {
    expect(checklistCount({ tally, inspection: null })).toEqual({ done: 5, total: 9 });
  });
  it("counts an inspection's open questions only", () => {
    expect(checklistCount({ tally, inspection: { total: 20, answered: 7 } })).toEqual({
      done: 7,
      total: 20,
    });
  });
});

describe("the list under the card", () => {
  it("folds done stops and marks the card's stop Now", () => {
    const stops = [
      job("a", { stop_done_on: today }),
      job("b", { status: "in_progress" }),
      job("c"),
    ];
    const h = todayHero({ stops: heroStops(stops), today, timeZone: TZ });
    const l = todayList(stops, today, h);
    expect(l.done.map((s) => s.id)).toEqual(["a"]);
    expect(l.rest.map((s) => s.id)).toEqual(["b", "c"]);
    expect(l.nowId).toBe("b");
    expect(h!.moment).toBe("on_site");
  });

  it("marks nothing Now while a stop just done shows, or once the day is done", () => {
    const stops = [job("a", { stop_done_on: today }), job("b")];
    const done = todayHero({ stops: heroStops(stops), today, timeZone: TZ, justDone: "a" });
    expect(done!.moment).toBe("done");
    expect(todayList(stops, today, done).nowId).toBeNull();
    const all = [job("a", { stop_done_on: today })];
    const end = todayHero({ stops: heroStops(all), today, timeZone: TZ });
    expect(end!.moment).toBe("day_done");
    expect(todayList(all, today, end).nowId).toBeNull();
  });
});
