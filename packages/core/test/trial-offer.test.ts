import { describe, expect, it } from "vitest";
import { servicesPriceCents, TRIAL_OFFER, trialPackage } from "../src";

describe("trial offer", () => {
  it("follows Pool Maintenance for Both", () => {
    expect(trialPackage("pool")).toBe("maintenance");
    expect(trialPackage("both")).toBe("maintenance");
    expect(trialPackage("leak")).toBe("leak");
  });

  it("says what each package includes", () => {
    for (const offer of Object.values(TRIAL_OFFER)) {
      expect(offer.promise).toMatch(/\.$/);
      expect(offer.included.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("servicesPriceCents", () => {
  it("prices each package, with Both as Pool Maintenance plus $49", () => {
    expect(servicesPriceCents("pool", 1)).toBe(7_900);
    expect(servicesPriceCents("leak", 1)).toBe(4_900);
    expect(servicesPriceCents("both", 4)).toBe(14_900 + 4_900);
    expect(servicesPriceCents("leak", 6)).toBe(9_900 + 2 * 2_500);
  });
});
