import { describe, expect, it } from "vitest";
import {
  depositFor,
  discountAllowed,
  lineFromItem,
  lineTotal,
  quoteTotals,
  suggestItems,
  type PriceBookItem,
} from "../src";

const HALF = { type: "percent" as const, value_bps: 5000, minimum_cents: 0 };

// The same figures are checked in supabase/tests/090_quotes.test.sql.
export const QUOTE_FIXTURE = {
  lines: [
    { quantity: 1, unit_price_cents: 85_000, taxable: true }, // repair: $850.00
    { quantity: 2.5, unit_price_cents: 12_999, taxable: true }, // 2.5 × $129.99 = $324.98 (324.975)
    { quantity: 1, unit_price_cents: 15_000, taxable: false }, // labor: $150.00
  ],
  discount_cents: 10_000,
  tax_rate_bps: 825,
  totals: {
    subtotal_cents: 132_498,
    discount_cents: 10_000,
    // taxable 117498, its share of the discount round(10000 × 117498 / 132498) = 8868
    tax_cents: 8_962, // round((117498 − 8868) × 0.0825) = round(8961.975)
    total_cents: 131_460,
    deposit_cents: 65_730,
  },
};

describe("quote totals", () => {
  it("multiplies quantity by unit price, rounding half up", () => {
    expect(lineTotal({ quantity: 2.5, unit_price_cents: 12_999 })).toBe(32_498);
    expect(lineTotal({ quantity: 0.33, unit_price_cents: 100 })).toBe(33);
  });

  it("takes the discount off before tax, shared across taxable and untaxed lines", () => {
    const f = QUOTE_FIXTURE;
    expect(quoteTotals(f.lines, f.discount_cents, f.tax_rate_bps, HALF)).toEqual(f.totals);
  });

  it("caps the discount at the subtotal and ignores removed lines", () => {
    const t = quoteTotals(
      [
        { quantity: 1, unit_price_cents: 5_000, taxable: true },
        { quantity: 1, unit_price_cents: 9_999, taxable: true, deleted_at: "2026-01-01" },
      ],
      9_000,
      825,
      HALF,
    );
    expect(t).toEqual({
      subtotal_cents: 5_000,
      discount_cents: 5_000,
      tax_cents: 0,
      total_cents: 0,
      deposit_cents: 0,
    });
  });

  it("applies deposit rules with a minimum and never more than the total", () => {
    expect(depositFor(100_000, HALF)).toBe(50_000);
    expect(depositFor(10_000, { ...HALF, minimum_cents: 25_000 })).toBe(10_000);
    expect(depositFor(80_000, { ...HALF, minimum_cents: 50_000 })).toBe(50_000);
    expect(depositFor(80_000, { type: "fixed", value_cents: 30_000, minimum_cents: 0 })).toBe(
      30_000,
    );
    expect(depositFor(0, HALF)).toBe(0);
  });

  it("limits a tech's discount but not an owner's", () => {
    expect(discountAllowed(100_000, 10_000, false, 1000)).toBe(true);
    expect(discountAllowed(100_000, 10_001, false, 1000)).toBe(false);
    expect(discountAllowed(100_000, 50_000, true, 1000)).toBe(true);
  });
});

describe("price book suggestions", () => {
  const item = (over: Partial<PriceBookItem>): PriceBookItem => ({
    id: over.name ?? "x",
    company_id: "c",
    name: "Item",
    unit: "each",
    price_cents: 1000,
    taxable: true,
    sort_order: 0,
    active: true,
    ...over,
  });
  const items = [
    item({ name: "Return line repair", component_type_key: "return", sort_order: 2 }),
    item({ name: "Return fitting", component_type_key: "return", sort_order: 1 }),
    item({ name: "Skimmer rebuild", component_type_key: "skimmer" }),
    item({ name: "Old return part", component_type_key: "return", active: false }),
  ];

  it("suggests active items for the finding's component type, in price book order", () => {
    expect(suggestItems(items, "return").map((i) => i.name)).toEqual([
      "Return fitting",
      "Return line repair",
    ]);
    expect(suggestItems(items, null)).toEqual([]);
  });

  it("copies the item's price and description into a new line", () => {
    const line = lineFromItem(
      item({ name: "Return fitting", description: "Replace fitting", price_cents: 4500 }),
      "f1",
    );
    expect(line).toMatchObject({
      description: "Return fitting: Replace fitting",
      quantity: 1,
      unit_price_cents: 4500,
      finding_id: "f1",
      price_book_item_id: "Return fitting",
    });
  });
});
