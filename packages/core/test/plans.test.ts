import { describe, expect, it } from "vitest";
import { competitorPrices, extraUsers, monthlyPriceCents, planTier, PLANS } from "../src";

describe("plan prices", () => {
  it("are flat tiers by team size", () => {
    const pool = (n: number) => monthlyPriceCents(PLANS.maintenance, n);
    expect([1, 2].map(pool)).toEqual([7_900, 7_900]);
    expect([3, 6].map(pool)).toEqual([14_900, 14_900]);
    expect([7, 12].map(pool)).toEqual([24_900, 24_900]);
    expect(pool(14)).toBe(24_900 + 2 * 1_500);
    expect(planTier(PLANS.maintenance, 5).name).toBe("Team");
    const leak = (n: number) => monthlyPriceCents(PLANS.leak, n);
    expect([leak(1), leak(2), leak(4), leak(6)]).toEqual([4_900, 9_900, 9_900, 9_900 + 2 * 2_500]);
  });
  it("charge pool maintenance at least as much as leak detection for teams of 3 to 10", () => {
    // Owner-approved tiers (2026-10-16): more at 1, 3-5, and 7-9 people, the same at 6 and 10.
    // Less only at 2 people (Starter $79, leak Team $99) and from 11 people, where leak's
    // per-person price passes Fleet.
    const pool = (n: number) => monthlyPriceCents(PLANS.maintenance, n);
    const leak = (n: number) => monthlyPriceCents(PLANS.leak, n);
    for (let n = 3; n <= 10; n++) expect(pool(n)).toBeGreaterThanOrEqual(leak(n));
    expect([6, 10].map((n) => pool(n) - leak(n))).toEqual([0, 0]);
    expect(pool(2)).toBeLessThan(leak(2));
    expect(pool(11)).toBeLessThan(leak(11));
  });
  it("treat odd team sizes sensibly", () => {
    expect(extraUsers(PLANS.leak, 0)).toBe(0);
    expect(extraUsers(PLANS.leak, 6.7)).toBe(2);
    expect(monthlyPriceCents(PLANS.leak, -3)).toBe(4_900);
  });
});

describe("the comparison on the website", () => {
  it("uses each competitor's public pricing", () => {
    // 4 people (3 techs, 1 office), 200 pools.
    expect(competitorPrices(4, 200).map((c) => c.monthlyCents)).toEqual([40_000, 24_500, 20_000]);
    // A one-person shop with 20 pools pays Skimmer's minimum.
    expect(competitorPrices(1, 20)[0]!.monthlyCents).toBe(9_800);
  });
  it("shows Sundeck Pro as the lowest for typical pool companies", () => {
    // Team sizes 1 to 13, each tech running about 70 pools.
    for (let n = 1; n <= 13; n++) {
      const pools = Math.max(1, n - 1) * 70;
      const ours = monthlyPriceCents(PLANS.maintenance, n);
      for (const c of competitorPrices(n, pools)) expect(ours).toBeLessThan(c.monthlyCents);
    }
  });
});

describe("services", () => {
  it("default to both, and say which experiences a shop has", async () => {
    const { companyServices, offersLeak, offersPool } = await import("../src");
    expect(companyServices(null)).toBe("both");
    expect(companyServices({ services: "nonsense" })).toBe("both");
    expect([offersLeak({ services: "pool" }), offersPool({ services: "pool" })]).toEqual([
      false,
      true,
    ]);
    expect([offersLeak({ services: "leak" }), offersPool({ services: "leak" })]).toEqual([
      true,
      false,
    ]);
    expect([offersLeak({}), offersPool({})]).toEqual([true, true]);
  });
});

describe("on my way", () => {
  it("goes out from Sundeck Pro Messages unless the shop chose the tech's phone", async () => {
    const { onMyWayVia } = await import("../src");
    expect(onMyWayVia(null)).toBe("messages");
    expect(onMyWayVia({ on_my_way: "nonsense" })).toBe("messages");
    expect(onMyWayVia({ on_my_way: "phone" })).toBe("phone");
  });
});

describe("Both (owner, 2026-10-19)", () => {
  it("is the Pool Maintenance tier plus the leak detection add-on, line by line", async () => {
    const { servicesPriceLines, servicesPriceCents } = await import("../src/plans");
    expect(servicesPriceLines("both", 4)).toEqual([
      { label: "Pool Maintenance · Team", cents: 14_900 },
      { label: "Leak Detection add-on", cents: 4_900 },
    ]);
    expect(servicesPriceCents("both", 4)).toBe(19_800);
    expect(servicesPriceLines("leak", 1)).toEqual([
      { label: "Leak Detection · Solo", cents: 4_900 },
    ]);
  });
});
