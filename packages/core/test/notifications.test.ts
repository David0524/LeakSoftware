import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_KINDS,
  jobNotification,
  liveStopContent,
  notificationOn,
  paymentNotification,
  quoteNotification,
  reportNotification,
  textNotification,
} from "../src";

describe("notifications", () => {
  it("are on unless turned off", () => {
    expect(NOTIFICATION_KINDS.map((k) => k.key)).toEqual([
      "text",
      "job",
      "quote",
      "payment",
      "report",
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

  it("on the way: the arrival time, no countdown", () => {
    expect(liveStopContent({ ...base, phase: "driving" })).toEqual({
      headline: "On the way to Smith",
      figure: "9:42 AM",
      figureLabel: "Arriving",
      detail: "Stop 3 of 7 · 123 Palm Ln",
      next: "Next: Jones at 10:30 AM",
      progress: 2 / 7,
      compact: "9:42",
      spoken: "On the way to Smith, arriving at 9:42 AM. Stop 3 of 7.",
    });
  });

  it("at the pool: the checklist, no timer", () => {
    const c = liveStopContent({ ...base, phase: "on_site" });
    expect(c.headline).toBe("At Smith");
    expect(c.figure).toBe("4 of 9");
    expect(c.figureLabel).toBe("Checklist");
    expect(c.compact).toBe("4/9");
    expect(c.progress).toBeCloseTo(2.5 / 7);
    expect(c.spoken).toBe("At Smith. Checklist 4 of 9. Stop 3 of 7. Next: Jones at 10:30 AM.");
  });

  it("done: the next stop, or the end of the day", () => {
    const c = liveStopContent({ ...base, phase: "done" });
    expect([c.headline, c.figure, c.figureLabel, c.next, c.progress]).toEqual([
      "Smith done",
      "✓",
      "Next stop",
      "Next: Jones at 10:30 AM",
      3 / 7,
    ]);
    const last = liveStopContent({ ...base, phase: "done", stop: 7, next: null });
    expect([last.figureLabel, last.next, last.progress]).toEqual([
      "Last stop",
      "That was the last stop today.",
      1,
    ]);
    expect(liveStopContent({ ...base, phase: "driving", eta: null }).figure).toBe("On the way");
  });
});
