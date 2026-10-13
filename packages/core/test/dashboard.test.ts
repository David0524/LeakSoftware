import { describe, expect, it } from "vitest";
import { acceptanceRate, dashboardTotals, monthLabel } from "../src";

describe("dashboard", () => {
  it("names months", () => {
    expect(monthLabel("2026-10")).toBe("Oct 2026");
    expect(monthLabel("2026-01", true)).toBe("January 2026");
  });
  it("gives the acceptance rate", () => {
    expect(acceptanceRate(3, 2)).toBe("67%");
    expect(acceptanceRate(0, 0)).toBe("–");
  });
  it("adds up the months shown", () => {
    const m = {
      quotes_sent: 2,
      quotes_accepted: 1,
      invoiced_cents: 100,
      outstanding_cents: 0,
      collected_cents: 50,
    };
    expect(
      dashboardTotals([
        { month: "2026-09", ...m },
        { month: "2026-10", ...m },
      ]),
    ).toEqual({
      quotes_sent: 4,
      quotes_accepted: 2,
      invoiced_cents: 200,
      collected_cents: 100,
    });
  });
});
