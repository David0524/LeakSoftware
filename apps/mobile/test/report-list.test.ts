import { describe, expect, it } from "vitest";
import { listReports, reportMatchesSearch, reportsNoMatch } from "../src/lib/reportList";

const r = (
  status: string,
  type: string,
  number: number,
  name: string,
  sent_at: string | null = null,
) => ({
  status,
  sent_at,
  updated_at: "2026-10-01T00:00:00Z",
  job: { type, number, customer: { name } },
});
const items = [
  r("sent", "repair", 1038, "Ann Smith", "2026-10-10T00:00:00Z"),
  r("draft", "leak_detection", 1040, "bob Jones"),
  r("sent", "repair", 1021, "Carl Smithers", "2026-10-20T00:00:00Z"),
  r("superseded", "repair", 1000, "Old"),
];
const base = { status: "all", type: "all" as const, search: "", sort: "newest" };

describe("Jobs › Reports list (owner, 2026-10-25)", () => {
  it("sorts newest first by default and hides superseded", () => {
    expect(listReports(items, base).map((x) => x.job.number)).toEqual([1021, 1038, 1040]);
  });
  it("sorts by customer and job number", () => {
    expect(listReports(items, { ...base, sort: "customer" }).map((x) => x.job.number)).toEqual([
      1038, 1040, 1021,
    ]);
    expect(listReports(items, { ...base, sort: "number" }).map((x) => x.job.number)).toEqual([
      1040, 1038, 1021,
    ]);
  });
  it("filters by type and status", () => {
    expect(listReports(items, { ...base, type: "repair" })).toHaveLength(2);
    expect(listReports(items, { ...base, status: "draft" })).toHaveLength(1);
    expect(listReports(items, { ...base, type: "inspection" })).toHaveLength(0);
  });
  it("searches the customer's name or the job number", () => {
    expect(listReports(items, { ...base, search: "SMITH" })).toHaveLength(2);
    expect(listReports(items, { ...base, search: "#1038" })).toHaveLength(1);
    expect(listReports(items, { ...base, search: "1038" })).toHaveLength(1);
    expect(reportMatchesSearch(items[0], "zzz")).toBe(false);
    expect(reportsNoMatch(" zzz ")).toBe("No reports match “zzz”.");
  });
});
