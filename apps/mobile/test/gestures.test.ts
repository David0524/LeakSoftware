import { describe, expect, it } from "vitest";
import { heroActions, todayHero } from "@leakbook/core";
import {
  doneIds,
  heroAdjustValue,
  heroSwipeStep,
  newlyDone,
  rubberBand,
  stepStop,
  viewingFor,
  viewingResetKey,
} from "../src/lib/heroBrowse";
import {
  messageKind,
  messageRoute,
  readOnMyWayDraft,
  smsUrl,
  stopMoment,
} from "../src/lib/heroMessage";
import { pageFits } from "../src/lib/pageScroll";
import { heroStops, todayList, type HeroSource } from "../src/lib/todayHero";

// Gestures, browsing Today's card, and On My Way in Message (owner, 2026-10-20;
// docs/design/2026-10-20-gestures.md).

const TZ = "America/Phoenix";
const today = "2026-10-20";
const job = (id: string, over: Partial<HeroSource> = {}): HeroSource => ({
  id,
  type: "detection",
  status: "scheduled",
  scheduled_start: "2026-10-20T16:00:00Z",
  customer: { name: `Customer ${id}` },
  property: { address_line1: `${id} Palm Ln`, access_notes: null },
  ...over,
});
const ids = ["a", "b", "c"];

describe("browsing Today's card", () => {
  it("steps to the stop before or after, and stops at either end", () => {
    expect(stepStop(ids, "b", 1)).toBe("c");
    expect(stepStop(ids, "b", -1)).toBe("a");
    expect(stepStop(ids, "a", -1)).toBeNull();
    expect(stepStop(ids, "c", 1)).toBeNull();
    // The day done: back shows the last stop, forward has nothing.
    expect(stepStop(ids, null, -1)).toBe("c");
    expect(stepStop(ids, null, 1)).toBeNull();
    expect(stepStop([], "a", 1)).toBeNull();
  });

  it("picking the day's own stop is back to following the day", () => {
    expect(viewingFor("b", "b")).toBeNull();
    expect(viewingFor("a", "b")).toBe("a");
    expect(viewingFor(null, "b")).toBeNull();
  });

  it("shows the picked stop with Back to Now, and Now stays on the day's stop", () => {
    const stops = [
      job("a", { stop_done_on: today }),
      job("b", { status: "in_progress" }),
      job("c"),
    ];
    const plain = todayHero({ stops: heroStops(stops), today, timeZone: TZ })!;
    expect(plain.browsing).toBe(false);
    expect(plain.currentId).toBe("b");

    const back = todayHero({ stops: heroStops(stops), today, timeZone: TZ, viewing: "a" })!;
    expect(back.browsing).toBe(true);
    expect(back.stopId).toBe("a");
    expect(back.moment).toBe("done");
    expect(back.currentId).toBe("b");
    // A done stop offers only its undo; never Start for another stop.
    expect(heroActions(back.moment, true)).toMatchObject({ primary: null, undo: true });
    expect(todayList(stops, today, back).nowId).toBe("b");

    const later = todayHero({ stops: heroStops(stops), today, timeZone: TZ, viewing: "c" })!;
    expect(later.moment).toBe("ahead");
    expect(heroActions(later.moment, true).primary).toBe("start_job");
    // TalkBack reads the stop it's on.
    expect(heroAdjustValue(later, "Derek Jeter")).toBe("Stop 3 of 3, Derek Jeter");
  });

  it("goes back by itself when a stop starts or completes, the day or the tech changes", () => {
    const stops = [job("a"), job("b")];
    const key = viewingResetKey(stops, today, "t1");
    // A change that doesn't move the day on keeps the tech where they browsed.
    expect(viewingResetKey([job("a", { customer: { name: "New" } }), job("b")], today, "t1")).toBe(
      key,
    );
    expect(viewingResetKey([job("a", { status: "in_progress" }), job("b")], today, "t1")).not.toBe(
      key,
    );
    expect(viewingResetKey([job("a", { stop_done_on: today }), job("b")], today, "t1")).not.toBe(
      key,
    );
    expect(viewingResetKey(stops, "2026-10-21", "t1")).not.toBe(key);
    expect(viewingResetKey(stops, today, "t2")).not.toBe(key);
  });

  it("a release moves on when far or fast enough, and resists past the ends", () => {
    expect(heroSwipeStep(-120, 0, 300)).toBe(1);
    expect(heroSwipeStep(120, 0, 300)).toBe(-1);
    expect(heroSwipeStep(-30, 0, 300)).toBe(0);
    // A quick flick counts even when short, but not a flick back the other way.
    expect(heroSwipeStep(-30, -800, 300)).toBe(1);
    expect(heroSwipeStep(-30, 800, 300)).toBe(0);
    const pulled = rubberBand(200, 300);
    expect(pulled).toBeGreaterThan(0);
    expect(pulled).toBeLessThan(200);
    expect(rubberBand(-200, 300)).toBeCloseTo(-pulled);
    expect(rubberBand(10_000, 300)).toBeLessThan(300);
  });

  it("reports stops completed since the last look, for the done banner", () => {
    const before = [job("a"), job("b")];
    const seen = doneIds(before, today);
    expect(newlyDone(null, before, today)).toEqual([]);
    const after = [job("a", { stop_done_on: today }), job("b")];
    expect(newlyDone(seen, after, today)).toEqual(["a"]);
    expect(newlyDone(doneIds(after, today), after, today)).toEqual([]);
  });
});

describe("On My Way lives in Message", () => {
  const base = { mine: true, onMyWayAt: null, today, timeZone: TZ };

  it("fills in On My Way on your own stop before you arrive, until it has gone out today", () => {
    expect(messageKind({ ...base, moment: "ahead" })).toBe("on_my_way");
    expect(messageKind({ ...base, moment: "driving" })).toBe("on_my_way");
    expect(messageKind({ ...base, moment: "on_site" })).toBe("blank");
    expect(messageKind({ ...base, moment: "done" })).toBe("blank");
    // Sent today: a blank text. Sent yesterday doesn't count.
    expect(messageKind({ ...base, moment: "ahead", onMyWayAt: "2026-10-20T15:00:00Z" })).toBe(
      "blank",
    );
    expect(messageKind({ ...base, moment: "ahead", onMyWayAt: "2026-10-19T15:00:00Z" })).toBe(
      "on_my_way",
    );
    // An owner looking at a tech's day always gets a blank text.
    expect(messageKind({ ...base, mine: false, moment: "ahead" })).toBe("blank");
  });

  it("reads a stop's moment from the job", () => {
    expect(stopMoment({ status: "scheduled" }, today)).toBe("ahead");
    expect(stopMoment({ status: "in_progress" }, today)).toBe("on_site");
    expect(stopMoment({ status: "scheduled", stop_done_on: today }, today)).toBe("done");
    expect(stopMoment({ status: "done" }, today)).toBe("done");
  });

  it("opens the conversation or a new message with the text filled in, and reads it back", () => {
    const draft = { jobId: "j1", driveMin: 14, body: "Hi Derek, I’m on my way." };
    const route = messageRoute({ conversationId: "c1", customerId: "u1", jobId: "j1", draft });
    expect(route.startsWith("/messages/c1?")).toBe(true);
    const q = Object.fromEntries(new URLSearchParams(route.split("?")[1]));
    expect(readOnMyWayDraft(q)).toEqual(draft);

    const fresh = messageRoute({ customerId: "u1", jobId: "j1", draft });
    expect(fresh.startsWith("/messages/new?")).toBe(true);
    expect(fresh).toContain("customer=u1");
    // A blank text carries no draft.
    expect(messageRoute({ conversationId: "c1", customerId: "u1", jobId: "j1" })).toBe(
      "/messages/c1",
    );
    expect(readOnMyWayDraft({})).toBeNull();
  });

  it("fills in the phone's own Messages without the shop's number", () => {
    expect(smsUrl("(480) 555-0188", "On my way")).toBe("sms:+14805550188?&body=On%20my%20way");
    expect(smsUrl("+14805550188")).toBe("sms:+14805550188");
  });
});

describe("pages that fit don't scroll", () => {
  it("fits when the content is no taller than the view", () => {
    expect(pageFits(600, 700)).toBe(true);
    expect(pageFits(700.5, 700)).toBe(true);
    expect(pageFits(900, 700)).toBe(false);
    // Not measured yet: scrolls as usual.
    expect(pageFits(0, 700)).toBe(false);
    expect(pageFits(600, 0)).toBe(false);
  });
});
