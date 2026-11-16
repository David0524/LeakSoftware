import { describe, expect, it } from "vitest";
import {
  cardFeesCents,
  chargeDays,
  monthlyCostsCents,
  paidBy,
  sortExpenses,
  sortServices,
  spentCents,
  type CompanyCost,
} from "./company-costs";

const cost = (over: Partial<CompanyCost>): CompanyCost => ({
  id: over.name ?? "x",
  name: "Cost",
  category: "software",
  amount_cents: 1000,
  repeats: "once",
  spent_on: "2026-10-01",
  ended_on: null,
  paid_by: "company",
  note: null,
  created_by: "staff@sundeckpro.com",
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

describe("company costs", () => {
  it("charges a monthly service on its day each month, the last day in short months", () => {
    const c = cost({ repeats: "monthly", spent_on: "2026-01-31" });
    expect(chargeDays(c, "2026-01-01", "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("stops when a service ended, and charges a yearly one once a year", () => {
    const m = cost({ repeats: "monthly", spent_on: "2026-01-15", ended_on: "2026-03-01" });
    expect(chargeDays(m, "2026-01-01", "2026-12-31")).toEqual(["2026-01-15", "2026-02-15"]);
    const y = cost({ repeats: "yearly", spent_on: "2025-06-10", amount_cents: 9900 });
    expect(spentCents(y, "2026-01-01", "2026-12-31")).toBe(9900);
    expect(spentCents(y, "2025-01-01", "2026-12-31")).toBe(19800);
  });

  it("counts a one-time expense in its period only", () => {
    const c = cost({ spent_on: "2026-11-02" });
    expect(spentCents(c, "2026-11-01", "2026-11-30")).toBe(1000);
    expect(spentCents(c, "2026-10-01", "2026-10-31")).toBe(0);
  });

  it("totals what David, Cole and the company paid; a service without a price counts nothing", () => {
    const costs = [
      cost({ paid_by: "david", amount_cents: 2500 }),
      cost({ paid_by: "cole", amount_cents: 4000 }),
      cost({ paid_by: "cole", repeats: "monthly", amount_cents: 2000, spent_on: "2026-10-05" }),
      cost({ repeats: "monthly", amount_cents: null }),
    ];
    expect(paidBy(costs, "2026-10-01", "2026-11-30")).toEqual({
      david: 2500,
      cole: 8000,
      company: 0,
    });
  });

  it("works out a month of running services, yearly ones over 12", () => {
    const costs = [
      cost({ repeats: "monthly", amount_cents: 2500 }),
      cost({ repeats: "yearly", amount_cents: 9900 }),
      cost({ repeats: "monthly", amount_cents: 2000, ended_on: "2026-10-31" }),
      cost({ repeats: "monthly", amount_cents: 5000, spent_on: "2027-01-01" }),
      cost({ amount_cents: 99_00 }),
    ];
    expect(monthlyCostsCents(costs, "2026-11-16")).toBe(2500 + 825);
  });

  it("estimates Stripe's card fees on each shop's charge", () => {
    expect(cardFeesCents([10000, 0, 5000])).toBe(290 + 30 + 145 + 30);
  });

  it("lists running services first and expenses newest first", () => {
    const list = [
      cost({ name: "Zed", repeats: "monthly" }),
      cost({ name: "Old", repeats: "monthly", ended_on: "2026-10-02" }),
      cost({ name: "Abe", repeats: "yearly" }),
      cost({ name: "Lunch", spent_on: "2026-10-03" }),
      cost({ name: "Cards", spent_on: "2026-11-01" }),
    ];
    expect(sortServices(list, "2026-11-16").map((c) => c.name)).toEqual(["Abe", "Zed", "Old"]);
    expect(sortExpenses(list).map((c) => c.name)).toEqual(["Cards", "Lunch"]);
  });
});
