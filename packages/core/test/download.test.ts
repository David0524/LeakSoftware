import { describe, expect, it } from "vitest";
import { downloadCount, downloadProgress } from "../src";

describe("downloadProgress (owner, 2026-10-20)", () => {
  it("waits without a number until the count comes back", () => {
    const p = downloadProgress({ job: 40 }, null);
    expect(p.fraction).toBeNull();
    expect(p.percent).toBe("");
    expect(p.kinds).toEqual([]);
    expect(p.spoken).toBe("Downloading your company.");
  });

  it("groups tables into kinds the shop knows, Settings first, and counts up to each total", () => {
    const p = downloadProgress(
      { company: 1, customer: 300, property: 120, job: 900, job_component: 50, media: 10 },
      {
        company: 1,
        membership: 3,
        customer: 312,
        property: 120,
        job: 1000,
        job_component: 40,
        media: 0,
      },
    );
    expect(p.kinds.map((k) => [k.label, k.done, k.total, k.complete])).toEqual([
      ["Settings", 1, 4, false],
      ["Customers", 300, 312, false],
      ["Pools", 120, 120, true],
      ["Jobs", 940, 1040, false],
    ]);
    expect(p.fraction).toBeCloseTo(1361 / 1476);
    expect(p.percent).toBe("92%");
    expect(p.current?.label).toBe("Settings");
    expect(p.spoken).toBe("Downloading your company, 92 percent.");
    expect(downloadCount(p.kinds[3]!)).toBe("940 of 1,040");
  });

  it("is done when everything is", () => {
    const p = downloadProgress({ customer: 5 }, { customer: 5 });
    expect([p.fraction, p.percent, p.current]).toEqual([1, "100%", null]);
    expect(downloadProgress({}, {}).fraction).toBeNull();
  });
});
