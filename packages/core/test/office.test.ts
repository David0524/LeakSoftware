import { describe, expect, it } from "vitest";
import {
  addDays,
  formatDay,
  formatTime,
  isDateString,
  scheduleBounds,
  addMonths,
  monthGrid,
  scheduleDays,
  timeline,
  weekStart,
  type AuditEntry,
} from "../src";

const TZ = "America/Phoenix"; // UTC-7 all year

describe("schedule", () => {
  it("works out days and weeks (weeks start Monday)", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekStart("2026-10-12")).toBe("2026-10-12"); // a Monday
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday
    expect(scheduleDays("day", "2026-10-14")).toEqual(["2026-10-14"]);
    expect(scheduleDays("week", "2026-10-14")).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    expect(isDateString("2026-10-14")).toBe(true);
    expect(isDateString("10/14/2026")).toBe(false);
  });

  it("bounds the view in the company time zone", () => {
    expect(scheduleBounds(["2026-10-12"], TZ)).toEqual({
      from: "2026-10-12T07:00:00.000Z",
      to: "2026-10-13T07:00:00.000Z",
    });
  });

  it("formats times and days", () => {
    expect(formatTime("2026-10-13T16:30:00Z", TZ)).toBe("9:30 AM");
    expect(formatDay("2026-10-13")).toBe("Tue, Oct 13");
  });
});

describe("timeline", () => {
  const at = "2026-10-12T15:00:00Z";
  const e = (over: Partial<AuditEntry>): AuditEntry => ({
    user_id: "u1",
    table_name: "job",
    row_id: "j1",
    field: null,
    old_value: null,
    new_value: null,
    created_at: at,
    ...over,
  });

  it("describes status changes, checklist marks, tests, findings, and removals", () => {
    const labels: Record<string, string> = { c1: "Return 3", t1: "Pressure test", f1: "Leak" };
    const events = timeline(
      [
        e({ field: "status", old_value: "scheduled", new_value: "in_progress" }),
        e({
          table_name: "checklist_item_result",
          row_id: "c1",
          field: "status",
          old_value: "pending",
          new_value: "inspected",
          created_at: "2026-10-12T15:01:00Z",
        }),
        e({
          table_name: "checklist_item_result",
          row_id: "c1",
          field: "method",
          old_value: null,
          new_value: "Pressure test",
          created_at: "2026-10-12T15:01:00Z",
        }),
        e({
          table_name: "test_result",
          row_id: "t1",
          field: "outcome",
          new_value: "fail",
          created_at: "2026-10-12T15:02:00Z",
        }),
        e({
          table_name: "finding",
          row_id: "f2",
          field: "title",
          new_value: "Return 3 line break",
          created_at: "2026-10-12T15:03:00Z",
        }),
        e({
          table_name: "finding",
          row_id: "f1",
          field: "deleted_at",
          old_value: null,
          new_value: "2026-10-12T15:04:00Z",
          created_at: "2026-10-12T15:04:00Z",
        }),
        // Created-pending checklist rows are noise.
        e({
          table_name: "checklist_item_result",
          row_id: "c9",
          field: "status",
          new_value: "pending",
          created_at: "2026-10-12T14:00:00Z",
        }),
      ],
      (table, id) =>
        table === "checklist_item_result" ? labels[id === "c1" ? "c1" : ""] : labels[id],
    );
    expect(events.map((x) => x.text)).toEqual([
      "Removed finding “Leak”",
      "Finding added: Return 3 line break",
      "Pressure test recorded: fail",
      "Return 3 inspected (Pressure test)",
      "Status: Scheduled → In progress",
    ]);
  });

  it("names job creation", () => {
    expect(timeline([e({ field: "status", new_value: "scheduled" })], () => undefined)).toEqual([
      { at, userId: "u1", text: "Job created (Scheduled)" },
    ]);
  });
});

describe("month view", () => {
  it("adds months, keeping the day where it can", () => {
    expect(addMonths("2026-10-13", 1)).toBe("2026-11-13");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("lays out whole weeks, Monday first", () => {
    const grid = monthGrid("2026-10-13"); // October 2026 starts on a Thursday
    expect(grid[0]).toBe("2026-09-28");
    expect(grid.at(-1)).toBe("2026-11-01");
    expect(grid.length % 7).toBe(0);
    expect(scheduleDays("month", "2026-10-13")).toEqual(grid);
  });
});
