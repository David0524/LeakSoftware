import { describe, expect, it } from "vitest";
import { accessNotice, billingSummary, checkoutTrialEnd, type CompanyAccess } from "../src";

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

describe("checkoutTrialEnd", () => {
  const signup = "2026-10-24T14:05:00Z";
  const trialEnds = new Date(Date.parse(signup) + 30 * 86_400_000).toISOString();
  const wholeDays = (end: number, at: Date) => Math.floor((end * 1000 - at.getTime()) / 86_400_000);

  it("shows a full 30 days at Checkout a few minutes after sign-up, ending at day 30's close", () => {
    const at = new Date(Date.parse(signup) + 7 * 60_000);
    const end = checkoutTrialEnd(trialEnds, at, "America/New_York")!;
    expect(wholeDays(end, at)).toBe(30);
    // 23:59:59 in New York on Nov. 23 (EST after the clocks change on Nov. 1).
    expect(new Date(end * 1000).toISOString()).toBe("2026-11-24T04:59:59.000Z");
    expect(end * 1000).toBeGreaterThanOrEqual(Date.parse(trialEnds));
  });
  it("counts what's left when the card comes later, never adding a day", () => {
    const at = new Date(Date.parse(signup) + 10 * 86_400_000 + 3_600_000);
    const end = checkoutTrialEnd(trialEnds, at, "America/Los_Angeles")!;
    expect(wholeDays(end, at)).toBe(20);
    expect(new Date(end * 1000).toISOString()).toBe("2026-11-24T07:59:59.000Z");
  });
  it("starts billing now with two days or less left, or no trial", () => {
    const at = new Date(Date.parse(trialEnds) - 2 * 86_400_000);
    expect(checkoutTrialEnd(trialEnds, at, "America/New_York")).toBeNull();
    expect(checkoutTrialEnd(null, at, "America/New_York")).toBeNull();
    expect(
      checkoutTrialEnd(trialEnds, new Date(at.getTime() - 60_000), "America/New_York"),
    ).not.toBeNull();
  });
});
