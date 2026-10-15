import { describe, expect, it } from "vitest";
import { extraUsers, monthlyPriceCents, PLANS } from "../src";

describe("plan prices", () => {
  it("cover two people for the base price", () => {
    for (const users of [1, 2]) {
      expect(monthlyPriceCents(PLANS.leak, users)).toBe(10_000);
      expect(monthlyPriceCents(PLANS.maintenance, users)).toBe(6_900);
    }
  });
  it("add each person after two", () => {
    expect(monthlyPriceCents(PLANS.leak, 3)).toBe(12_500);
    expect(monthlyPriceCents(PLANS.leak, 6)).toBe(20_000);
    expect(monthlyPriceCents(PLANS.maintenance, 3)).toBe(8_900);
    expect(monthlyPriceCents(PLANS.maintenance, 6)).toBe(14_900);
  });
  it("treat odd team sizes sensibly", () => {
    expect(extraUsers(PLANS.leak, 0)).toBe(0);
    expect(extraUsers(PLANS.leak, 4.7)).toBe(2);
    expect(monthlyPriceCents(PLANS.leak, -3)).toBe(10_000);
  });
});
