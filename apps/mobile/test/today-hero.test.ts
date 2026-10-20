import { dismissalAfter, liveStopPhase } from "../src/lib/liveStopRule";
import { describe, expect, it } from "vitest";
import { heroActions, todayHero } from "@leakbook/core";
import {
  checklistCount,
  cleaningWord,
  cleaningsLine,
  heroStops,
  liveStopBody,
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

describe("cleanings on the card and the notification", () => {
  const cleanings = new Map([
    [
      "a",
      [
        { name: "Clean salt cell", kind: "salt_cell" as const, days: 14, weeks: 2 },
        { name: "Clean filter", kind: "filter" as const, days: -3, weeks: 0 },
      ],
    ],
  ]);

  it("carries each stop's cleanings to the card, soonest first, read aloud", () => {
    const h = todayHero({
      stops: heroStops([job("a", { status: "in_progress" }), job("b")], new Map(), cleanings),
      today,
      timeZone: TZ,
    })!;
    expect(h.content.cleanings.map((c) => [c.kind, c.label, c.overdue])).toEqual([
      ["filter", "Overdue", true],
      ["salt_cell", "2 weeks", false],
    ]);
    expect(h.content.cleanings.map((c) => c.spoken)).toEqual([
      "Clean filter overdue",
      "Clean salt cell due in 2 weeks",
    ]);
    expect(h.content.spoken).toMatch(/Clean filter overdue, Clean salt cell due in 2 weeks\.$/);
    // A stop without cleanings has none.
    expect(heroStops([job("b")], new Map(), cleanings)[0]!.cleanings).toEqual([]);
  });

  it("hides them once the stop is done", () => {
    const stops = [job("a", { stop_done_on: today }), job("b")];
    const done = todayHero({
      stops: heroStops(stops, new Map(), cleanings),
      today,
      timeZone: TZ,
      // Swiped back to it: the phones no longer hold a just-done stop (gestures spec 9).
      viewing: "a",
    })!;
    expect(done.moment).toBe("done");
    expect(done.content.cleanings).toEqual([]);
    expect(liveStopBody(done.content, cleanings.get("a"))).not.toMatch(/Filter|Salt cell/);
  });

  it("names each kind in a word or two", () => {
    expect(cleaningWord({ kind: "filter", name: "Clean filter" })).toBe("Filter");
    expect(cleaningWord({ kind: "filter_replace", name: "Replace filter" })).toBe("New filter");
    expect(cleaningWord({ kind: "salt_cell", name: "Clean salt cell" })).toBe("Salt cell");
    expect(cleaningWord({ kind: "other", name: "Clean pump basket" })).toBe("Clean pump basket");
  });

  it("puts them on one line after the access notes in the expanded notification", () => {
    const h = todayHero({
      stops: heroStops(
        [
          job("a", {
            status: "in_progress",
            property: { address_line1: "1 Palm Ln", access_notes: "Gate 4821" },
          }),
          job("b"),
        ],
        new Map([["a", { done: 4, total: 9 }]]),
        cleanings,
      ),
      today,
      timeZone: TZ,
    })!;
    const lines = liveStopBody(h.content, cleanings.get("a")).split("\n");
    // The collapsed line is still the figure.
    expect(lines[0]).toBe(`${h.content.figureLabel} ${h.content.figure}`);
    expect(lines[1]).toBe("Access: Gate 4821");
    expect(lines[2]).toBe("Filter overdue · Salt cell 2 weeks");
    expect(lines[3]).toBe(h.content.detail);
    expect(cleaningsLine([], cleanings.get("a")!)).toBeNull();
    // Without cleanings the text is as before.
    const plain = todayHero({
      stops: heroStops([job("a", { status: "in_progress" })]),
      today,
      timeZone: TZ,
    })!;
    expect(liveStopBody(plain.content)).toBe(
      [
        [plain.content.figureLabel, plain.content.figure].filter(Boolean).join(" "),
        plain.content.detail,
      ]
        .filter(Boolean)
        .join("\n"),
    );
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
    // No clock time on the card or the notification (gestures spec section 10).
    expect([h.content.figure, h.content.figureLabel]).toEqual(["2 of 2", "Stop"]);
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

  it("keeps Now on the day's stop while the card shows a done one, and none once the day is done", () => {
    const stops = [job("a", { stop_done_on: today }), job("b")];
    const done = todayHero({ stops: heroStops(stops), today, timeZone: TZ, viewing: "a" });
    expect(done!.moment).toBe("done");
    expect(done!.browsing).toBe(true);
    expect(todayList(stops, today, done).nowId).toBe("b");
    const all = [job("a", { stop_done_on: today })];
    const end = todayHero({ stops: heroStops(all), today, timeZone: TZ });
    expect(end!.moment).toBe("day_done");
    expect(todayList(all, today, end).nowId).toBeNull();
  });
});

describe("the ongoing stop notification", () => {
  const day = "2026-10-20";
  it("shows whenever the app is open during the working day, not only at its start", () => {
    expect(liveStopPhase({ moment: "ahead", runs: true, dismissedOn: null, today: day })).toBe(
      "ahead",
    );
    // Before the day starts only a stop on the way shows; a done stop shows its minute.
    expect(liveStopPhase({ moment: "ahead", runs: false, dismissedOn: null, today: day })).toBe(
      null,
    );
    expect(liveStopPhase({ moment: "driving", runs: false, dismissedOn: null, today: day })).toBe(
      "driving",
    );
    expect(liveStopPhase({ moment: "done", runs: false, dismissedOn: null, today: day })).toBe(
      "done",
    );
    expect(liveStopPhase({ moment: "day_done", runs: true, dismissedOn: null, today: day })).toBe(
      null,
    );
  });

  it("stays away after a swipe only while the app stays in the background", () => {
    const swiped = dismissalAfter(null, { kind: "swiped", day });
    expect(swiped).toBe(day);
    expect(liveStopPhase({ moment: "on_site", runs: true, dismissedOn: swiped, today: day })).toBe(
      null,
    );
    // Opening the app (or bringing it to the front) brings it back the same day.
    const back = dismissalAfter(swiped, { kind: "foreground" });
    expect(back).toBeNull();
    expect(liveStopPhase({ moment: "on_site", runs: true, dismissedOn: back, today: day })).toBe(
      "on_site",
    );
    expect(dismissalAfter(swiped, { kind: "on_my_way" })).toBeNull();
    // Yesterday's swipe never holds today.
    expect(
      liveStopPhase({ moment: "ahead", runs: true, dismissedOn: "2026-10-19", today: day }),
    ).toBe("ahead");
  });
});
