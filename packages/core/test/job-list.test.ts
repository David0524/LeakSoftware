import { describe, expect, it } from "vitest";
import { formatSchedule, groupJobs, localDate, type Job } from "../src";

const TZ = "America/Phoenix"; // UTC-7, no daylight saving
const now = new Date("2026-10-12T17:00:00Z"); // 10:00 AM in Phoenix

function job(id: string, over: Partial<Job>): Job {
  return { id, company_id: "c", type: "detection", property_id: "p", status: "scheduled", ...over };
}

describe("groupJobs", () => {
  it("buckets by the shop's local day", () => {
    const g = groupJobs(
      [
        job("late-today", { scheduled_start: "2026-10-13T05:30:00Z" }), // 10:30 PM Oct 12 in Phoenix
        job("tomorrow", { scheduled_start: "2026-10-13T16:00:00Z" }),
        job("running", { status: "in_progress", scheduled_start: "2026-10-01T16:00:00Z" }),
        job("no-date", { status: "unscheduled", created_at: "2026-10-10T00:00:00Z" }),
        job("paid", { status: "paid", scheduled_start: "2026-10-05T16:00:00Z" }),
        job("old", { status: "paid", scheduled_start: "2026-06-01T16:00:00Z" }),
        job("gone", { deleted_at: "2026-10-11T00:00:00Z" }),
        job("missed", { scheduled_start: "2026-10-09T16:00:00Z" }),
      ],
      now,
      TZ,
    );
    expect(g.today.map((j) => j.id)).toEqual(["running", "late-today"]);
    expect(g.upcoming.map((j) => j.id)).toEqual(["tomorrow"]);
    expect(g.unscheduled.map((j) => j.id)).toEqual(["no-date"]);
    expect(g.recent.map((j) => j.id)).toEqual(["missed", "paid"]);
  });

  it("localDate uses the time zone, not UTC", () => {
    expect(localDate(new Date("2026-10-13T05:30:00Z"), TZ)).toBe("2026-10-12");
  });

  it("formats schedules relative to today", () => {
    expect(formatSchedule("2026-10-12T16:00:00Z", now, TZ)).toBe("9:00 AM");
    expect(formatSchedule("2026-10-14T16:00:00Z", now, TZ)).toBe("Wed, Oct 14, 9:00 AM");
    expect(formatSchedule(null, now, TZ)).toBe("Not scheduled");
  });
});
