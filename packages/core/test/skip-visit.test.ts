import { describe, expect, it } from "vitest";
import {
  autoSkipNotification,
  canSkipVisit,
  pickableSkipReasons,
  skipActions,
  skipBadge,
  skipCustomerText,
  skipNeedsOffice,
  skipNotification,
  skipSummary,
  skipValues,
  skipsUnfinishedVisits,
  stopDone,
  type SkipReason,
} from "../src";

const reason = (label: string, over: Partial<SkipReason> = {}): SkipReason => ({
  id: label,
  label,
  sort_order: 10,
  active: true,
  ...over,
});

describe("skip reasons", () => {
  it("offers live reasons in the shop's order, never the server's own", () => {
    const rows = [
      reason("Weather", { sort_order: 40 }),
      reason("Locked Gate", { sort_order: 10 }),
      reason("Not Done", { sort_order: 900, system: true }),
      reason("Old", { sort_order: 20, deleted_at: "2026-11-01T00:00:00Z" }),
      reason("Off", { sort_order: 30, active: false }),
      reason("Dog in Yard", { sort_order: 10 }),
    ];
    expect(pickableSkipReasons(rows).map((r) => r.label)).toEqual([
      "Dog in Yard",
      "Locked Gate",
      "Weather",
    ]);
  });
});

describe("Skip Visit", () => {
  it("is for maintenance visits not yet done", () => {
    expect(canSkipVisit({ type: "maintenance", status: "scheduled" })).toBe(true);
    expect(canSkipVisit({ type: "maintenance", status: "unscheduled" })).toBe(true);
    expect(canSkipVisit({ type: "maintenance", status: "in_progress" })).toBe(true);
    expect(canSkipVisit({ type: "maintenance", status: "done" })).toBe(false);
    expect(canSkipVisit({ type: "maintenance", status: "skipped" })).toBe(false);
    expect(canSkipVisit({ type: "maintenance", status: "invoiced" })).toBe(false);
    expect(canSkipVisit({ type: "detection", status: "scheduled" })).toBe(false);
    expect(canSkipVisit({ type: "repair", status: "scheduled" })).toBe(false);
  });

  it("writes the reason, the trimmed note and the phone's time", () => {
    expect(
      skipValues({ reason: " Dog in Yard ", note: "  Two big dogs ", at: "2026-11-16T15:05:00Z" }),
    ).toEqual({
      status: "skipped",
      skip_reason: "Dog in Yard",
      skip_note: "Two big dogs",
      skipped_at: "2026-11-16T15:05:00Z",
    });
    expect(skipValues({ reason: "Weather", note: "   ", at: "x" }).skip_note).toBeNull();
    expect(skipValues({ reason: "Weather", at: "x" }).skip_note).toBeNull();
    expect(
      skipValues({ reason: "Weather", note: "a".repeat(2000), at: "x" }).skip_note,
    ).toHaveLength(1000);
  });

  it("is off the route, but not done work", () => {
    expect(stopDone({ status: "skipped" }, "2026-11-16")).toBe(true);
    expect(skipBadge({ status: "skipped" })).toBe("Skipped");
    expect(skipBadge({ status: "done" })).toBeNull();
  });
});

describe("the office's side", () => {
  it("waits for Reschedule or Dismiss until it is handled", () => {
    expect(skipNeedsOffice({ status: "skipped" })).toBe(true);
    expect(skipNeedsOffice({ status: "skipped", skip_handled_at: "2026-11-16T16:00:00Z" })).toBe(
      false,
    );
    expect(skipNeedsOffice({ status: "scheduled" })).toBe(false);
  });

  it("offers Reschedule and Dismiss to owners and admins, Undo to anyone", () => {
    expect(skipActions({ status: "skipped" }, true)).toEqual({
      reschedule: true,
      dismiss: true,
      undo: true,
    });
    expect(skipActions({ status: "skipped" }, false)).toEqual({
      reschedule: false,
      dismiss: false,
      undo: true,
    });
    expect(skipActions({ status: "skipped", skip_handled_at: "x" }, true).dismiss).toBe(false);
    expect(skipActions({ status: "scheduled" }, true)).toEqual({
      reschedule: false,
      dismiss: false,
      undo: false,
    });
  });

  it("summarizes why, who and when", () => {
    expect(
      skipSummary({ skip_reason: "Dog in Yard", skipped_at: "x" }, "Alex", "Nov 16, 9:05 AM"),
    ).toBe("Dog in Yard · Alex, Nov 16, 9:05 AM");
    expect(skipSummary({ skip_reason: "Not Done" }, null, "Nov 16")).toBe("Not Done · Nov 16");
    expect(skipSummary({ skip_reason: "Weather" }, null, null)).toBe("Weather");
  });
});

describe("words", () => {
  it("texts the customer the reason", () => {
    expect(
      skipCustomerText({
        customer: "Rebecca Soto",
        tech: "Alex Kim",
        shop: "Blue Pools.",
        reason: "Dog in Yard",
      }),
    ).toBe(
      "Hi Rebecca, this is Alex from Blue Pools. We had to skip today’s pool service (dog in yard). We’ll be in touch to reschedule.",
    );
    expect(
      skipCustomerText({ customer: null, tech: "Alex", shop: "Blue", reason: "Weather" }),
    ).toBe(
      "Hi, this is Alex from Blue. We had to skip today’s pool service (weather). We’ll be in touch to reschedule.",
    );
  });

  it("tells the owners", () => {
    expect(skipNotification({ customer: "Soto", reason: "Locked Gate", by: "Alex" })).toEqual({
      title: "Visit skipped",
      body: "Soto: Locked Gate, skipped by Alex.",
    });
    expect(skipNotification({ customer: "Soto", reason: "Weather", by: null }).body).toBe(
      "Soto: Weather.",
    );
    expect(autoSkipNotification(1).title).toBe("A visit wasn’t done");
    expect(autoSkipNotification(3).title).toBe("3 visits weren’t done");
  });
});

describe("Skip Unfinished Visits at Day's End", () => {
  it("is off unless turned on", () => {
    expect(skipsUnfinishedVisits({})).toBe(false);
    expect(skipsUnfinishedVisits(null)).toBe(false);
    expect(skipsUnfinishedVisits({ skip_unfinished_visits: false })).toBe(false);
    expect(skipsUnfinishedVisits({ skip_unfinished_visits: true })).toBe(true);
  });
});
