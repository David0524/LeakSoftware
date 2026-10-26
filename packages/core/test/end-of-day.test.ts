import { describe, expect, it } from "vitest";
import { endOfDay } from "../src";

const tz = "America/New_York";
const today = "2026-10-26";
const done = (id: string) => ({ id, done: true });

describe("end of day", () => {
  it("waits for every stop", () => {
    expect(
      endOfDay({
        stops: [done("a"), { id: "b", done: false }],
        reports: [],
        quotes: [],
        today,
        timeZone: tz,
      }),
    ).toBeNull();
    expect(endOfDay({ stops: [], reports: [], quotes: [], today, timeZone: tz })).toBeNull();
  });

  it("counts pools, reports sent and quotes accepted on the day's own jobs", () => {
    const day = endOfDay({
      stops: [done("a"), done("b"), done("c")],
      reports: [
        { job_id: "a", sent_at: "2026-10-26T14:00:00Z", status: "sent" },
        { job_id: "a", sent_at: "2026-10-26T15:00:00Z", status: "sent" },
        { job_id: "b", sent_at: "2026-10-26T16:00:00Z", status: "superseded" },
        { job_id: "c", sent_at: null, status: "draft" },
        // Another tech's job, and yesterday's.
        { job_id: "x", sent_at: "2026-10-26T14:00:00Z", status: "sent" },
        { job_id: "c", sent_at: "2026-10-25T14:00:00Z", status: "sent" },
      ],
      quotes: [
        { job_id: "a", accepted_at: "2026-10-26T18:00:00Z" },
        { job_id: "c", accepted_at: "2026-10-26T19:00:00Z" },
        { job_id: "b", accepted_at: null },
        { job_id: "x", accepted_at: "2026-10-26T18:00:00Z" },
      ],
      today,
      timeZone: tz,
    });
    expect(day).toEqual({
      pools: 3,
      reports: 2,
      quotes: 2,
      line: "Today: 3 pools · 2 reports sent · 2 quotes accepted",
    });
  });

  it("leaves out zero parts and uses singular words", () => {
    expect(
      endOfDay({ stops: [done("a")], reports: [], quotes: [], today, timeZone: tz })?.line,
    ).toBe("Today: 1 pool");
    expect(
      endOfDay({
        stops: [done("a"), done("b")],
        reports: [{ job_id: "a", sent_at: "2026-10-26T14:00:00Z" }],
        quotes: [],
        today,
        timeZone: tz,
      })?.line,
    ).toBe("Today: 2 pools · 1 report sent");
  });

  it("reads the day in the shop's time zone", () => {
    // 11 PM Eastern on the 26th is the 27th in UTC.
    const late = { job_id: "a", sent_at: "2026-10-27T03:00:00Z", status: "sent" };
    expect(
      endOfDay({ stops: [done("a")], reports: [late], quotes: [], today, timeZone: tz })?.reports,
    ).toBe(1);
    expect(
      endOfDay({ stops: [done("a")], reports: [late], quotes: [], today, timeZone: "UTC" })
        ?.reports,
    ).toBe(0);
  });
});
