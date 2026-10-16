import { describe, expect, it } from "vitest";
import {
  ONBOARDING,
  onboardingPackage,
  painsToAnswer,
  parseOnboardingAnswers,
  servicesPriceCents,
} from "../src";

describe("onboarding", () => {
  it("follows Pool Maintenance for Both", () => {
    expect(onboardingPackage("pool")).toBe("maintenance");
    expect(onboardingPackage("both")).toBe("maintenance");
    expect(onboardingPackage("leak")).toBe("leak");
  });

  it("answers every goal's package with five to seven choices", () => {
    for (const c of Object.values(ONBOARDING)) {
      expect(c.goals.length).toBeGreaterThanOrEqual(5);
      expect(c.goals.length).toBeLessThanOrEqual(7);
      expect(c.pains.length).toBeGreaterThanOrEqual(5);
      for (const id of c.defaultPains) expect(c.pains.map((p) => p.id)).toContain(id);
    }
  });

  it("keeps only known answers and fills the defaults", () => {
    expect(
      parseOnboardingAnswers({
        package: "leak",
        goal: "repairs",
        pains: ["speed", "nope", "quotes"],
        people: "3",
        color: "#A12B2B",
        depositBps: 2500,
        chlorine: "calhypo65",
      }),
    ).toEqual({
      package: "leak",
      goal: "repairs",
      pains: ["speed", "quotes"],
      people: 3,
      color: "#A12B2B",
      depositBps: 2500,
    });
    expect(
      parseOnboardingAnswers({ package: "maintenance", goal: "repairs", color: "red", people: 0 }),
    ).toEqual({
      package: "maintenance",
      goal: null,
      pains: [],
      people: 1,
      color: "#12263A",
      chlorine: "liquid12",
    });
    expect(parseOnboardingAnswers({ package: "both" })).toBeNull();
    expect(parseOnboardingAnswers(null)).toBeNull();
  });

  it("answers the picked pains, or the usual three", () => {
    expect(painsToAnswer("leak", ["quotes"]).map((p) => p.id)).toEqual(["quotes"]);
    expect(painsToAnswer("maintenance", []).map((p) => p.id)).toEqual([
      "proof",
      "billing",
      "chemistry",
    ]);
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
