import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_KINDS,
  jobNotification,
  liveStopContent,
  notificationOn,
  paymentNotification,
  quoteNotification,
  reportNotification,
  reportOpenedNotification,
  textNotification,
  weeklySummaryOn,
} from "../src";

describe("feedback notifications (owner, 2026-10-22)", () => {
  it("say a customer opened the report", () => {
    expect(reportOpenedNotification("Rebecca Soto")).toEqual({
      title: "Report opened",
      body: "Rebecca Soto opened the report.",
    });
    expect(notificationOn({}, "opened")).toBe(true);
    expect(notificationOn({ opened: false }, "opened")).toBe(false);
  });

  it("say what a payment was, in dollars and cents", () => {
    expect(paymentNotification("Rebecca Soto", 65000, "invoice 1042").body).toBe(
      "Rebecca Soto paid $650.00 (invoice 1042).",
    );
  });

  it("send the weekly summary to owners unless turned off, admins when turned on", () => {
    expect(weeklySummaryOn({}, "owner")).toBe(true);
    expect(weeklySummaryOn(null, "owner")).toBe(true);
    expect(weeklySummaryOn({ weekly: false }, "owner")).toBe(false);
    expect(weeklySummaryOn({}, "admin")).toBe(false);
    expect(weeklySummaryOn({ weekly: true }, "admin")).toBe(true);
    expect(weeklySummaryOn({ weekly: "no" }, "owner")).toBe(true);
    expect(weeklySummaryOn({ weekly: true }, "tech")).toBe(false);
    expect(weeklySummaryOn({ weekly: true }, null)).toBe(false);
  });
});

describe("notifications", () => {
  it("are on unless turned off", () => {
    expect(NOTIFICATION_KINDS.map((k) => k.key)).toEqual([
      "text",
      "job",
      "quote",
      "payment",
      "report",
      "opened",
      "live",
      "day",
    ]);
    expect(notificationOn({}, "text")).toBe(true);
    expect(notificationOn(null, "job")).toBe(true);
    expect(notificationOn({ text: false }, "text")).toBe(false);
    expect(notificationOn({ text: false }, "payment")).toBe(true);
  });

  it("say what happened, short", () => {
    expect(textNotification("Dana Smith", "  Gate is\nopen ")).toEqual({
      title: "Dana Smith",
      body: "Gate is open",
    });
    expect(textNotification("+16025550100", "").body).toBe("Sent a picture");
    expect(textNotification("A", "x".repeat(300)).body).toHaveLength(178);
    expect(
      jobNotification({
        moved: false,
        customer: "Smith",
        address: "123 Palm Ln",
        when: "Tue 9:30 AM",
      }),
    ).toEqual({ title: "New stop Tue 9:30 AM", body: "Smith, 123 Palm Ln" });
    expect(jobNotification({ moved: true, customer: "Smith", address: null, when: null })).toEqual({
      title: "Stop moved to another day",
      body: "Smith",
    });
    expect(quoteNotification("Smith", 125000).body).toBe("Smith accepted the $1,250.00 quote.");
    expect(paymentNotification("Smith", 65730, "invoice 1042").body).toBe(
      "Smith paid $657.30 (invoice 1042).",
    );
    expect(reportNotification("Smith")).toEqual({
      title: "Report signed",
      body: "Smith signed the report.",
    });
  });
});

describe("liveStopContent", () => {
  const base = {
    customer: "Smith",
    address: "123 Palm Ln",
    stop: 3,
    stops: 7,
    eta: "9:42 AM",
    checklistDone: 4,
    checklistTotal: 9,
    next: { customer: "Jones", time: "10:30 AM" },
  };

  it("on the way: the stop's place in the day, no clock times", () => {
    expect(liveStopContent({ ...base, phase: "driving" })).toEqual({
      headline: "On the way to Smith",
      figure: "3 of 7",
      figureLabel: "Stop",
      detail: "Stop 3 of 7 · 123 Palm Ln",
      next: "Then: Jones",
      progress: 2 / 7,
      compact: "3/7",
      spoken: "On the way to Smith. Stop 3 of 7.",
      access: null,
      cleanings: [],
    });
  });

  it("at the pool: the checklist, no timer", () => {
    const c = liveStopContent({ ...base, phase: "on_site" });
    expect(c.headline).toBe("At Smith");
    expect(c.figure).toBe("4 of 9");
    expect(c.figureLabel).toBe("Checklist");
    expect(c.compact).toBe("4/9");
    // Stops done of all (owner, 2026-10-22): the two before this one.
    expect(c.progress).toBeCloseTo(2 / 7);
    expect(c.spoken).toBe("At Smith. Checklist 4 of 9. Stop 3 of 7. Then: Jones.");
  });

  it("fills the bar with the stops done, in any order", () => {
    // Stop 3 of 7 with four done (two later stops marked complete first).
    expect(liveStopContent({ ...base, phase: "on_site", doneStops: 4 }).progress).toBeCloseTo(
      4 / 7,
    );
  });

  it("done: the next stop, or the end of the day", () => {
    const c = liveStopContent({ ...base, phase: "done" });
    expect([c.headline, c.figure, c.figureLabel, c.next, c.progress]).toEqual([
      "Smith done",
      "✓",
      "Next stop",
      "Then: Jones",
      3 / 7,
    ]);
    const last = liveStopContent({ ...base, phase: "done", stop: 7, next: null });
    expect([last.figureLabel, last.next, last.progress]).toEqual([
      "Last stop",
      "That was the last stop today.",
      1,
    ]);
    expect(liveStopContent({ ...base, phase: "driving", stops: 0 }).figure).toBe("On the way");
  });
});

describe("the workday's Live Activity", () => {
  const base = {
    customer: "Smith",
    address: "123 Palm Ln",
    stop: 1,
    stops: 5,
    eta: null,
    scheduled: "9:00 AM",
    checklistDone: 0,
    checklistTotal: 9,
    next: { customer: "Jones", time: "10:30 AM" },
  };

  it("shows the first stop ahead, without a clock time", async () => {
    const { liveStopContent } = await import("../src");
    expect(liveStopContent({ ...base, phase: "ahead" })).toEqual({
      headline: "Up next: Smith",
      figure: "1 of 5",
      figureLabel: "Stop",
      detail: "Stop 1 of 5 · 123 Palm Ln",
      next: "Then: Jones",
      progress: 0,
      compact: "1/5",
      spoken: "Up next: Smith. Stop 1 of 5.",
      access: null,
      cleanings: [],
    });
    expect(liveStopContent({ ...base, phase: "ahead", stops: 0 }).figure).toBe("Today");
  });

  it("starts at the shop's working day, on its work days, while stops are left", async () => {
    const { liveStopRuns } = await import("../src");
    const settings = { routing: { day_start: "07:30", work_days: [1, 2, 3, 4, 5] } };
    // 2026-10-19 is a Monday.
    expect(liveStopRuns({ settings, date: "2026-10-19", nowMin: 7 * 60 + 29, stopsLeft: 3 })).toBe(
      false,
    );
    expect(liveStopRuns({ settings, date: "2026-10-19", nowMin: 7 * 60 + 30, stopsLeft: 3 })).toBe(
      true,
    );
    expect(liveStopRuns({ settings, date: "2026-10-19", nowMin: 15 * 60, stopsLeft: 0 })).toBe(
      false,
    );
    expect(liveStopRuns({ settings, date: "2026-10-18", nowMin: 9 * 60, stopsLeft: 3 })).toBe(
      false,
    );
    // A stop already started or On My Way runs it at any hour (owner, 2026-10-22).
    expect(
      liveStopRuns({ settings, date: "2026-10-19", nowMin: 5 * 60, stopsLeft: 3, underway: true }),
    ).toBe(true);
    expect(
      liveStopRuns({ settings, date: "2026-10-18", nowMin: 9 * 60, stopsLeft: 1, underway: true }),
    ).toBe(true);
    expect(
      liveStopRuns({ settings, date: "2026-10-19", nowMin: 5 * 60, stopsLeft: 0, underway: true }),
    ).toBe(false);
  });
});

describe("access notes on the Live Activity", () => {
  const base = {
    customer: "Smith",
    address: "123 Palm Ln",
    stop: 1,
    stops: 3,
    eta: "9:42 AM",
    checklistDone: 0,
    checklistTotal: 9,
    next: null,
  };

  it("show the gate and the dog until the stop is done", async () => {
    const { liveStopContent } = await import("../src");
    const access = "Side gate code 4821.\n  Dog in yard.";
    const driving = liveStopContent({ ...base, phase: "driving", access });
    expect(driving.access).toBe("Side gate code 4821. Dog in yard.");
    expect(driving.spoken).toMatch(/Access: Side gate code 4821\. Dog in yard\.$/);
    expect(liveStopContent({ ...base, phase: "on_site", access }).access).not.toBeNull();
    expect(liveStopContent({ ...base, phase: "done", access }).access).toBeNull();
    expect(liveStopContent({ ...base, phase: "ahead", access: "   " }).access).toBeNull();
  });

  it("fit on one line", async () => {
    const { accessLine } = await import("../src");
    expect(accessLine(null)).toBeNull();
    const long = accessLine("x".repeat(120))!;
    expect(long).toHaveLength(90);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("cleanings on the Live Activity", () => {
  const base = {
    customer: "Smith",
    address: "123 Palm Ln",
    stop: 1,
    stops: 3,
    eta: null,
    checklistDone: 0,
    checklistTotal: 9,
    next: null,
  };
  const cleanings = [
    { name: "Clean salt cell", kind: "salt_cell" as const, days: 14, weeks: 2 },
    { name: "Clean filter", kind: "filter" as const, days: -2, weeks: 0 },
  ];

  it("show each cleaning's icon and how soon, soonest first, until the stop is done", async () => {
    const { liveStopContent } = await import("../src");
    const c = liveStopContent({ ...base, phase: "ahead", cleanings });
    expect(c.cleanings).toEqual([
      { kind: "filter", label: "Overdue", spoken: "Clean filter overdue", overdue: true },
      {
        kind: "salt_cell",
        label: "2 weeks",
        spoken: "Clean salt cell due in 2 weeks",
        overdue: false,
      },
    ]);
    expect(c.spoken).toMatch(/Clean filter overdue, Clean salt cell due in 2 weeks\.$/);
    expect(liveStopContent({ ...base, phase: "done", cleanings }).cleanings).toEqual([]);
    expect(liveStopContent({ ...base, phase: "on_site" }).cleanings).toEqual([]);
  });
});

describe("the start of the day (owner, 2026-10-22: first stop in one tap)", () => {
  const smith = { id: "j1", customer: "Smith", address: "123 Palm Ln" };
  const jones = { id: "j2", customer: "Jones", address: null };
  // Thursday 2026-10-22, Friday 23, Saturday 24 (not a default work day), Monday 26.
  const base = { settings: {}, timeZone: "America/Phoenix", today: "2026-10-22", nowMin: 6 * 60 };

  it("words the day and its first stop", async () => {
    const { dayStartNotification } = await import("../src");
    expect(dayStartNotification(5, smith)).toEqual({
      title: "5 stops today",
      body: "First: Smith, 123 Palm Ln",
    });
    expect(dayStartNotification(1, jones)).toEqual({ title: "1 stop today", body: "First: Jones" });
  });

  it("is today's, at the start of the working day, before it starts", async () => {
    const { dayStartAlert } = await import("../src");
    const a = dayStartAlert({ ...base, days: [{ date: "2026-10-22", stops: [smith, jones] }] });
    expect(a).toMatchObject({ date: "2026-10-22", jobId: "j1", text: { title: "2 stops today" } });
    // 8:00 in Phoenix (UTC-7) is 15:00 UTC: the default day start.
    expect(a?.at).toBe("2026-10-22T15:00:00.000Z");
  });

  it("moves to the next work day with stops once the day has begun", async () => {
    const { dayStartAlert } = await import("../src");
    const days = [
      { date: "2026-10-22", stops: [smith] },
      { date: "2026-10-23", stops: [] },
      { date: "2026-10-24", stops: [jones] },
      { date: "2026-10-26", stops: [jones, smith] },
    ];
    const a = dayStartAlert({ ...base, nowMin: 9 * 60, days });
    expect(a).toMatchObject({ date: "2026-10-26", jobId: "j2" });
    // A Saturday counts when the shop works Saturdays.
    const sat = dayStartAlert({
      ...base,
      nowMin: 9 * 60,
      settings: { routing: { work_days: [1, 2, 3, 4, 5, 6] } },
      days,
    });
    expect(sat?.date).toBe("2026-10-24");
  });

  it("is nothing without stops ahead", async () => {
    const { dayStartAlert } = await import("../src");
    expect(dayStartAlert({ ...base, days: [] })).toBeNull();
    expect(dayStartAlert({ ...base, days: [{ date: "2026-10-21", stops: [smith] }] })).toBeNull();
  });

  it("has its own switch, on by default", () => {
    expect(NOTIFICATION_KINDS.map((k) => k.key)).toContain("day");
    expect(notificationOn({}, "day")).toBe(true);
  });
});
