import { describe, expect, it } from "vitest";
import { jobOnPhones, PHONE_HISTORY_DAYS } from "../src";

const now = new Date("2026-10-15T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe("jobs on phones", () => {
  it("keeps open jobs however old", () => {
    for (const status of [
      "unscheduled",
      "scheduled",
      "in_progress",
      "report_sent",
      "invoiced",
    ] as const)
      expect(
        jobOnPhones(
          { status, scheduled_start: daysAgo(900), completed_at: null, updated_at: daysAgo(900) },
          now,
        ),
      ).toBe(true);
  });

  it("keeps finished jobs for the window, counting from the latest date", () => {
    const job = {
      status: "done" as const,
      scheduled_start: daysAgo(200),
      completed_at: daysAgo(199),
    };
    expect(jobOnPhones({ ...job, updated_at: daysAgo(PHONE_HISTORY_DAYS - 1) }, now)).toBe(true);
    expect(jobOnPhones({ ...job, updated_at: daysAgo(PHONE_HISTORY_DAYS + 1) }, now)).toBe(false);
  });

  it("gives phones a margin past the server's window", () => {
    const job = {
      status: "paid" as const,
      scheduled_start: null,
      completed_at: daysAgo(PHONE_HISTORY_DAYS + 3),
      updated_at: null,
    };
    expect(jobOnPhones(job, now)).toBe(false);
    expect(jobOnPhones(job, now, 7)).toBe(true);
  });
});
