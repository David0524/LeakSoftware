import { describe, expect, it } from "vitest";
import { accessNotice, billingSummary, type CompanyAccess } from "../src";

const now = new Date("2026-10-13T12:00:00Z");
const base: CompanyAccess = {
  status: "trialing",
  plan: "standard",
  trial_ends_at: "2026-11-01T12:00:00Z",
  current_period_end: null,
  subscribed: false,
  locked: false,
};

describe("billing notices", () => {
  it("says nothing early in the trial", () => {
    expect(accessNotice(base, now)).toBeNull();
    expect(billingSummary(base, now)).toBe("Free trial: 19 days left (ends November 1, 2026).");
  });
  it("warns in the trial's last week, unless already subscribed", () => {
    const late = { ...base, trial_ends_at: "2026-10-16T12:00:00Z" };
    expect(accessNotice(late, now)!.text).toBe(
      "The free trial ends in 3 days. Subscribe in Settings › Billing to keep working.",
    );
    expect(accessNotice({ ...late, subscribed: true }, now)).toBeNull();
  });
  it("counts down the grace after a failed payment", () => {
    const a = { ...base, status: "past_due" as const, current_period_end: "2026-10-10T12:00:00Z" };
    expect(accessNotice(a, now)!.text).toContain("within 4 days");
  });
  it("says read-only when locked, and that nothing is lost", () => {
    const n = accessNotice({ ...base, locked: true }, now)!;
    expect(n.tone).toBe("error");
    expect(n.text).toContain("Everything is still here");
  });
  it("summarizes an active subscription", () => {
    expect(
      billingSummary(
        { ...base, status: "active", current_period_end: "2026-11-13T12:00:00Z" },
        now,
      ),
    ).toBe("Active. Renews on November 13, 2026.");
  });
});
