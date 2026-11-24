import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRICES,
  overriddenCents,
  overrideActive,
  overrideFromRow,
  overrideText,
  priceListFromJson,
  priceListProblem,
  priceListToJson,
  servicesPriceCents,
  shopPriceCents,
  type PriceList,
} from "../src";

const raised: PriceList = {
  ...DEFAULT_PRICES,
  maintenance: {
    ...DEFAULT_PRICES.maintenance,
    tiers: DEFAULT_PRICES.maintenance.tiers.map((t) => ({ ...t, priceCents: t.priceCents + 1000 })),
  },
  bothAddonCents: 5900,
};

describe("price lists", () => {
  it("prices from the default list match the published prices", () => {
    expect(servicesPriceCents("pool", 4)).toBe(14_900);
    expect(servicesPriceCents("both", 4)).toBe(14_900 + 4_900);
    expect(servicesPriceCents("leak", 1)).toBe(4_900);
  });

  it("prices from another list", () => {
    expect(servicesPriceCents("pool", 4, raised)).toBe(15_900);
    expect(servicesPriceCents("both", 4, raised)).toBe(15_900 + 5_900);
    expect(servicesPriceCents("leak", 1, raised)).toBe(4_900);
  });

  it("round-trips through the stored JSON", () => {
    expect(priceListFromJson(priceListToJson(raised))).toEqual(raised);
    expect(priceListFromJson(priceListToJson(DEFAULT_PRICES))).toEqual(DEFAULT_PRICES);
  });

  it("falls back to the default prices for missing or broken lists", () => {
    expect(priceListFromJson(null)).toBe(DEFAULT_PRICES);
    expect(priceListFromJson({ maintenance: { tiers: [] } })).toBe(DEFAULT_PRICES);
    const broken = priceListToJson(raised) as { leak: { tiers: { price_cents: number }[] } };
    broken.leak.tiers[1]!.price_cents = 1;
    expect(priceListFromJson(broken)).toBe(DEFAULT_PRICES);
  });

  it("says what's wrong with a list", () => {
    expect(priceListProblem(DEFAULT_PRICES)).toBeNull();
    const tiers = (t: { name: string; upTo: number; priceCents: number }[]): PriceList => ({
      ...DEFAULT_PRICES,
      leak: { ...DEFAULT_PRICES.leak, tiers: t },
    });
    expect(priceListProblem(tiers([]))).toBe("Leak Detection needs 1 to 6 tiers.");
    expect(priceListProblem(tiers([{ name: " ", upTo: 1, priceCents: 100 }]))).toMatch(/name/);
    expect(
      priceListProblem(
        tiers([
          { name: "A", upTo: 2, priceCents: 100 },
          { name: "B", upTo: 2, priceCents: 200 },
        ]),
      ),
    ).toMatch(/more people/);
    expect(
      priceListProblem(
        tiers([
          { name: "A", upTo: 1, priceCents: 200 },
          { name: "B", upTo: 2, priceCents: 200 },
        ]),
      ),
    ).toMatch(/costs more/);
    expect(priceListProblem(tiers([{ name: "A", upTo: 1, priceCents: 0 }]))).toMatch(/price/);
    expect(priceListProblem({ ...DEFAULT_PRICES, bothAddonCents: -1 })).toMatch(/Both/);
  });
});

describe("a shop's own price", () => {
  const fixed = overrideFromRow({
    custom_price_kind: "fixed",
    custom_price_cents: 9900,
    custom_price_until: "2027-03-31",
  });
  const pct = overrideFromRow({ custom_price_kind: "percent", custom_percent_off: 20 });

  it("reads the row", () => {
    expect(fixed).toEqual({ kind: "fixed", cents: 9900, percent: null, until: "2027-03-31" });
    expect(pct).toEqual({ kind: "percent", cents: null, percent: 20, until: null });
    expect(overrideFromRow({})).toBeNull();
    expect(overrideFromRow({ custom_price_kind: "percent", custom_percent_off: 0 })).toBeNull();
  });

  it("applies through its last day", () => {
    expect(overrideActive(fixed, "2027-03-31")).toBe(true);
    expect(overrideActive(fixed, "2027-04-01")).toBe(false);
    expect(overriddenCents(14_900, fixed, "2027-03-31")).toBe(9900);
    expect(overriddenCents(14_900, fixed, "2027-04-01")).toBe(14_900);
    expect(overriddenCents(14_900, pct, "2030-01-01")).toBe(11_920);
    expect(overriddenCents(14_900, null, "2030-01-01")).toBe(14_900);
  });

  it("reads in words", () => {
    expect(overrideText(fixed!)).toBe("$99.00 a month through Mar 31, 2027");
    expect(overrideText(pct!)).toBe("20% off the standard price");
  });

  it("is the price the portal shows", () => {
    const shop = { services: "pool", people: 3, team_size: null, today: "2026-11-24" };
    expect(shopPriceCents(shop)).toBe(14_900);
    expect(shopPriceCents({ ...shop, price_list: priceListToJson(raised) })).toBe(15_900);
    expect(shopPriceCents({ ...shop, custom_price_kind: "percent", custom_percent_off: 50 })).toBe(
      7450,
    );
  });
});
