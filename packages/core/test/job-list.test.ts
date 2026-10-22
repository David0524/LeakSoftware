import { describe, expect, it } from "vitest";
import {
  ALL_JOB_TYPES,
  JOB_SORTS,
  formatSchedule,
  jobTypeFilter,
  jobsEmpty,
  jobTypeFilterLabel,
  jobTypeFilters,
  matchesJobType,
  groupJobs,
  jobSort,
  localDate,
  sortJobs,
  type Job,
} from "../src";

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

describe("sortJobs (owner, 2026-10-20)", () => {
  const jobs = [
    {
      id: "a",
      number: 3,
      scheduled_start: "2026-10-22T16:00:00Z",
      created_at: "2026-10-01T00:00:00Z",
      customer: "lee",
    },
    {
      id: "b",
      number: 7,
      scheduled_start: null,
      created_at: "2026-10-05T00:00:00Z",
      customer: "Adams",
    },
    {
      id: "c",
      number: 5,
      scheduled_start: "2026-10-21T16:00:00Z",
      created_at: "2026-10-03T00:00:00Z",
      customer: null,
    },
  ];
  const ids = (sort: string) => sortJobs(jobs, sort).map((j) => j.id);

  it("sorts by each key in the menu, Scheduled Date by default", () => {
    expect(JOB_SORTS.map((s) => s.label)).toEqual([
      "Scheduled Date",
      "Newest",
      "Oldest",
      "Customer",
      "Job Number",
    ]);
    expect(ids("scheduled")).toEqual(["c", "a", "b"]);
    expect(ids("nonsense")).toEqual(["c", "a", "b"]);
    expect(ids("newest")).toEqual(["b", "c", "a"]);
    expect(ids("oldest")).toEqual(["a", "c", "b"]);
    expect(ids("customer")).toEqual(["b", "a", "c"]);
    expect(ids("number")).toEqual(["b", "c", "a"]);
    expect(jobSort("customer")).toBe("customer");
    expect(jobSort(undefined)).toBe("scheduled");
  });
});

describe("job type filter (owner, 2026-10-22)", () => {
  it("lists All Types, then the shop's job types in New Job's order", () => {
    expect(jobTypeFilters("both")).toEqual([
      { key: "all", label: "All Types" },
      { key: "maintenance", label: "Maintenance" },
      { key: "repair", label: "Repair" },
      { key: "detection", label: "Leak Detection" },
      { key: "inspection", label: "Pool Inspection" },
    ]);
    expect(jobTypeFilters("pool").map((f) => f.key)).toEqual(["all", "maintenance", "repair"]);
    expect(jobTypeFilters("leak").map((f) => f.key)).toEqual([
      "all",
      "repair",
      "detection",
      "inspection",
    ]);
  });

  it("reads a type from the address, All Types when the shop's menu lacks it", () => {
    expect(jobTypeFilter("repair", "both")).toBe("repair");
    expect(jobTypeFilter("detection", "pool")).toBe("all");
    expect(jobTypeFilter("bogus", "both")).toBe("all");
    expect(jobTypeFilter(undefined, "both")).toBe("all");
    expect(jobTypeFilter(["repair"], "both")).toBe("all");
  });

  it("names the menu button and matches jobs", () => {
    expect(jobTypeFilterLabel("all")).toBe(ALL_JOB_TYPES);
    expect(jobTypeFilterLabel("inspection")).toBe("Pool Inspection");
    expect(matchesJobType("repair", "all")).toBe(true);
    expect(matchesJobType(null, "all")).toBe(true);
    expect(matchesJobType("repair", "repair")).toBe(true);
    expect(matchesJobType("detection", "repair")).toBe(false);
    expect(matchesJobType(null, "repair")).toBe(false);
  });

  it("says when a type has no jobs", () => {
    expect(jobsEmpty("all")).toBe("No jobs here. Add one with New Job, or on the phone.");
    expect(jobsEmpty("inspection")).toBe("No pool inspection jobs here.");
  });
});
