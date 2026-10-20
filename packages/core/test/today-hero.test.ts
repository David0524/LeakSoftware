import { describe, expect, it } from "vitest";
import {
  heroActions,
  heroHeadline,
  heroDrive,
  heroSegmentsSpoken,
  heroSubtitle,
  todayHero,
  type HeroStop,
} from "../src";

const TZ = "America/Phoenix";
const today = "2026-10-20";
const stop = (id: string, over: Partial<HeroStop> = {}): HeroStop => ({
  id,
  type: "detection",
  status: "scheduled",
  customer: `Customer ${id}`,
  address: `${id} Palm Ln`,
  scheduled_start: "2026-10-20T16:00:00Z", // 9:00 AM in Phoenix
  checklistDone: 0,
  checklistTotal: 0,
  ...over,
});

describe("todayHero (owner, 2026-10-20)", () => {
  it("shows the first stop not done, up next, with its scheduled time", () => {
    const h = todayHero({
      stops: [stop("a", { stop_done_on: today }), stop("b", { access: "Gate 4821" }), stop("c")],
      today,
      timeZone: TZ,
    })!;
    expect(h.moment).toBe("ahead");
    expect(h.stopId).toBe("b");
    expect([h.stop, h.stops, h.doneCount]).toEqual([2, 3, 1]);
    expect(h.segments).toEqual(["done", "current", "todo"]);
    expect(h.content.headline).toBe("Up next: Customer b");
    expect([h.content.figure, h.content.figureLabel]).toEqual(["9:00 AM", "Scheduled"]);
    expect(h.content.next).toBe("Next: Customer c at 9:00 AM");
    expect(h.content.access).toBe("Gate 4821");
  });

  it("is on the way after On My Way today, with the arrival time", () => {
    const h = todayHero({
      stops: [
        stop("a"),
        stop("b", { on_my_way_at: "2026-10-20T16:30:00Z", arrive_at: "2026-10-20T16:52:00Z" }),
      ],
      today,
      timeZone: TZ,
    })!;
    expect(h.moment).toBe("driving");
    expect(h.stopId).toBe("b");
    expect([h.content.figure, h.content.figureLabel]).toEqual(["9:52 AM", "Arriving"]);
  });

  it("ignores an On My Way from another day", () => {
    const h = todayHero({
      stops: [stop("a", { on_my_way_at: "2026-10-19T16:30:00Z" })],
      today,
      timeZone: TZ,
    })!;
    expect(h.moment).toBe("ahead");
  });

  it("is at the pool once the job starts, with the checklist", () => {
    const h = todayHero({
      stops: [stop("a"), stop("b", { status: "in_progress", checklistDone: 4, checklistTotal: 9 })],
      today,
      timeZone: TZ,
    })!;
    expect(h.moment).toBe("on_site");
    expect(h.stopId).toBe("b");
    expect(h.content.figure).toBe("4 of 9");
  });

  it("shows a stop just completed as done, with the next one", () => {
    const h = todayHero({
      stops: [stop("a", { status: "done", type: "maintenance" }), stop("b")],
      today,
      timeZone: TZ,
      justDone: "a",
    })!;
    expect(h.moment).toBe("done");
    expect(h.content.headline).toBe("Customer a done");
    expect(h.content.next).toBe("Next: Customer b at 9:00 AM");
    expect(h.segments).toEqual(["done", "todo"]);
  });

  it("says the day is done when every stop is", () => {
    const h = todayHero({
      stops: [stop("a", { stop_done_on: today }), stop("b", { status: "report_sent" })],
      today,
      timeZone: TZ,
    })!;
    expect(h.moment).toBe("day_done");
    expect(h.stopId).toBeNull();
    expect(h.content.headline).toBe("All 2 stops done");
    expect(heroSegmentsSpoken(h)).toBe("2 of 2 stops done");
    expect(todayHero({ stops: [], today, timeZone: TZ })).toBeNull();
  });
});

describe("the card's buttons and lines", () => {
  it("gives each moment its main button, and none of the tech's to someone else", () => {
    // Start Job from the start; On My Way is an icon until it's sent.
    expect(heroActions("ahead", true)).toEqual({
      primary: "start_job",
      complete: false,
      onMyWay: true,
    });
    expect(heroActions("driving", true)).toEqual({
      primary: "start_job",
      complete: false,
      onMyWay: false,
    });
    expect(heroActions("on_site", true)).toEqual({
      primary: "open_checklist",
      complete: true,
      onMyWay: false,
    });
    expect(heroActions("done", true)).toMatchObject({ primary: "start_job", onMyWay: true });
    expect(heroActions("ahead", false).onMyWay).toBe(false);
    expect(heroActions("day_done", true).primary).toBeNull();
    expect(heroActions("ahead", false).primary).toBeNull();
    expect(heroActions("driving", false).primary).toBeNull();
    expect(heroActions("on_site", false).primary).toBe("open_checklist");
  });

  it("says the job type, the stop, and the drive", () => {
    expect(heroSubtitle("Leak detection", { stop: 3, stops: 7, moment: "ahead" })).toBe(
      "Leak detection · Stop 3 of 7",
    );
    expect(heroDrive("ahead", 14)).toBe("14 min drive");
    expect(heroDrive("ahead", 75)).toBe("1 hr 15 min drive");
    expect(heroDrive("ahead", 60)).toBe("1 hr drive");
    expect(heroDrive("driving", 14)).toBeNull();
    expect(heroDrive("ahead", 0)).toBeNull();
  });
});

describe("heroHeadline", () => {
  it("names the moment, not the customer the card already names", () => {
    const content = { headline: "All 3 stops done" } as never;
    expect(heroHeadline({ moment: "ahead", content })).toBe("Up next");
    expect(heroHeadline({ moment: "driving", content })).toBe("On the way");
    expect(heroHeadline({ moment: "on_site", content })).toBe("At the pool");
    expect(heroHeadline({ moment: "done", content })).toBe("Done");
    expect(heroHeadline({ moment: "day_done", content })).toBe("All 3 stops done");
  });
});
