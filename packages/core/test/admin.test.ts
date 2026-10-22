import { describe, expect, it } from "vitest";
import {
  type AdminShop,
  canceledBetween,
  mrrCents,
  mrrHistory,
  searchShops,
  servicesPriceCents,
  shopPriceCents,
  shopStanding,
  shopsCsv,
  sortShops,
  trialsEnding,
} from "../src";

const shop = (over: Partial<AdminShop> = {}): AdminShop => ({
  id: "s1",
  name: "Blue Wave Pools",
  legal_name: null,
  email: "office@bluewave.test",
  phone: "+16025550100",
  address_line1: null,
  address_line2: null,
  city: "Phoenix",
  state: "AZ",
  postal_code: null,
  timezone: "America/Phoenix",
  created_at: "2026-09-01T00:00:00Z",
  services: "pool",
  status: "active",
  plan: "standard",
  trial_ends_at: null,
  current_period_end: null,
  access_code: null,
  card_required: false,
  stripe_customer_id: "cus_1",
  stripe_subscription_id: "sub_1",
  locked: false,
  people: 3,
  owner_id: "u1",
  owner_name: "Dana Reyes",
  owner_email: "dana@bluewave.test",
  owner_phone: "+16025550199",
  last_active_at: "2026-10-21T00:00:00Z",
  jobs_30d: 12,
  jobs_total: 80,
  customers: 40,
  payments_on: true,
  payouts_on: true,
  payments_details_submitted: true,
  stripe_account_id: "acct_1",
  ...over,
});

describe("shopStanding", () => {
  it("reads the subscription the way billing does", () => {
    expect(shopStanding(shop())).toBe("paying");
    expect(shopStanding(shop({ status: "past_due" }))).toBe("past_due");
    expect(shopStanding(shop({ status: "canceled" }))).toBe("canceled");
    expect(shopStanding(shop({ status: "trialing", stripe_subscription_id: null }))).toBe("trial");
    expect(
      shopStanding(shop({ status: "trialing", stripe_subscription_id: null, locked: true })),
    ).toBe("trial_ended");
  });

  it("calls shops that aren't charged demos", () => {
    expect(shopStanding(shop({ plan: "demo" }))).toBe("demo");
    expect(shopStanding(shop({ stripe_subscription_id: null }))).toBe("demo");
  });
});

describe("prices and MRR", () => {
  it("prices a shop like billing: its package and active people", () => {
    expect(shopPriceCents(shop())).toBe(servicesPriceCents("pool", 3));
    expect(shopPriceCents(shop({ services: "both", people: 0 }))).toBe(
      servicesPriceCents("both", 1),
    );
  });

  it("counts paying and past-due shops only", () => {
    const shops = [
      shop({ id: "a" }),
      shop({ id: "b", status: "past_due" }),
      shop({ id: "c", status: "trialing", stripe_subscription_id: null }),
      shop({ id: "d", plan: "demo" }),
      shop({ id: "e", status: "canceled" }),
    ];
    expect(mrrCents(shops)).toBe(2 * servicesPriceCents("pool", 3));
  });

  it("rebuilds MRR month by month from the history", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    const shops = [shop({ id: "a" }), shop({ id: "b" })];
    const events = [
      { company_id: "a", status: "trialing", plan: "standard", at: "2026-08-05T00:00:00Z" },
      { company_id: "a", status: "active", plan: "standard", at: "2026-09-05T00:00:00Z" },
      { company_id: "b", status: "trialing", plan: "standard", at: "2026-09-10T00:00:00Z" },
      { company_id: "b", status: "active", plan: "standard", at: "2026-10-10T00:00:00Z" },
      { company_id: "a", status: "canceled", plan: "standard", at: "2026-10-15T00:00:00Z" },
      // A shop that's gone isn't counted.
      { company_id: "gone", status: "active", plan: "standard", at: "2026-09-01T00:00:00Z" },
    ];
    const price = servicesPriceCents("pool", 3);
    const history = mrrHistory(shops, events, now, 3);
    expect(history).toEqual([
      { month: "2026-08-01", cents: 0 },
      { month: "2026-09-01", cents: price },
      { month: "2026-10-01", cents: price },
    ]);
    expect(
      canceledBetween(shops, events, new Date("2026-10-01"), now).map((c) => c.shop.id),
    ).toEqual(["a"]);
  });
});

describe("lists", () => {
  it("finds trials ending soon, soonest first", () => {
    const now = new Date("2026-10-22T00:00:00Z");
    const shops = [
      shop({
        id: "late",
        status: "trialing",
        stripe_subscription_id: null,
        trial_ends_at: "2026-11-30T00:00:00Z",
      }),
      shop({
        id: "b",
        status: "trialing",
        stripe_subscription_id: null,
        trial_ends_at: "2026-10-28T00:00:00Z",
      }),
      shop({
        id: "a",
        status: "trialing",
        stripe_subscription_id: null,
        trial_ends_at: "2026-10-24T00:00:00Z",
      }),
    ];
    expect(trialsEnding(shops, now, 14).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("searches names, owners, emails and phone digits", () => {
    const shops = [
      shop(),
      shop({
        id: "2",
        name: "Desert Leak Pros",
        owner_name: "Sam Lee",
        owner_email: "sam@dlp.test",
        phone: "+14805551234",
        owner_phone: null,
      }),
    ];
    expect(searchShops(shops, "dana").map((s) => s.id)).toEqual(["s1"]);
    expect(searchShops(shops, "(480) 555-1234").map((s) => s.id)).toEqual(["2"]);
    expect(searchShops(shops, "  ")).toHaveLength(2);
  });

  it("sorts by a column either way", () => {
    const shops = [
      shop({ id: "a", name: "Beta", people: 2 }),
      shop({ id: "b", name: "alpha", people: 9 }),
    ];
    expect(sortShops(shops, "name", false).map((s) => s.id)).toEqual(["b", "a"]);
    expect(sortShops(shops, "people", true).map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("exports a spreadsheet-safe CSV", () => {
    const csv = shopsCsv([shop({ name: "=Pools, Inc." })]);
    expect(csv.split("\r\n")[0]).toMatch(/^Shop,Package,Standing,People,Monthly price/);
    expect(csv).toContain(`"'=Pools, Inc."`);
    expect(csv).toContain("Pool Maintenance,Paying,3,");
  });
});
