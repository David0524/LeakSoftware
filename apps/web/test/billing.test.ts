import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  applyBillingEvent,
  subscriptionStatus,
  syncSubscriptionPrice,
} from "../src/server/billing";

/** Records `from("subscription").update(values).eq(column, value)` calls. */
function fakeDb() {
  const updates: { values: Record<string, unknown>; where: [string, string] }[] = [];
  const db = {
    from(table: string) {
      expect(table).toBe("subscription");
      return {
        update(values: Record<string, unknown>) {
          return {
            async eq(column: string, value: string) {
              updates.push({ values, where: [column, value] });
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { db: db as unknown as SupabaseClient, updates };
}

const event = (type: string, object: object) =>
  ({ id: `evt_${type}`, type, data: { object } }) as unknown as Stripe.Event;

describe("Tidemark billing events", () => {
  it("maps Stripe's states to trialing, active, past due, or canceled", () => {
    expect(subscriptionStatus("trialing")).toBe("trialing");
    expect(subscriptionStatus("active")).toBe("active");
    expect(subscriptionStatus("unpaid")).toBe("past_due");
    expect(subscriptionStatus("incomplete_expired")).toBe("canceled");
  });

  it("links the shop to its Stripe subscription when checkout finishes", async () => {
    const { db, updates } = fakeDb();
    const applied = await applyBillingEvent(
      event("checkout.session.completed", {
        id: "cs_1",
        customer: "cus_1",
        subscription: "sub_1",
        metadata: { kind: "tidemark_subscription", company_id: "co_1" },
      }),
      db,
    );
    expect(applied).toBe(true);
    expect(updates[0]!.where).toEqual(["company_id", "co_1"]);
    expect(updates[0]!.values).toMatchObject({
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
    });
  });

  it("keeps the status and renewal date current", async () => {
    const { db, updates } = fakeDb();
    await applyBillingEvent(
      event("customer.subscription.updated", {
        id: "sub_1",
        customer: "cus_1",
        status: "past_due",
        trial_end: null,
        metadata: { company_id: "co_1" },
        items: { data: [{ current_period_end: 1_800_000_000 }] },
      }),
      db,
    );
    expect(updates[0]!.values).toMatchObject({
      status: "past_due",
      current_period_end: new Date(1_800_000_000 * 1000).toISOString(),
    });
    await applyBillingEvent(
      event("customer.subscription.deleted", {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        metadata: {},
        items: { data: [] },
      }),
      db,
    );
    expect(updates[1]!.values).toMatchObject({ status: "canceled" });
    expect(updates[1]!.where).toEqual(["stripe_subscription_id", "sub_1"]);
  });

  it("leaves shop payments (deposits, invoices) to the payment handler", async () => {
    const { db, updates } = fakeDb();
    const applied = await applyBillingEvent(
      event("checkout.session.completed", { id: "cs_2", metadata: { kind: "quote_deposit" } }),
      db,
    );
    expect(applied).toBe(false);
    expect(updates).toHaveLength(0);
  });
});

/** Answers the reads syncSubscriptionPrice makes: subscription, company, and member count. */
function priceDb(services: string, people: number) {
  const rows: Record<string, unknown> = {
    subscription: { stripe_subscription_id: "sub_1", plan: "standard", status: "trialing" },
    company: { settings: { services } },
  };
  return {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: rows[table], error: null }),
        single: async () => ({ data: rows[table], error: null }),
        then: (done: (v: unknown) => unknown) => done({ count: people, error: null }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

function fakeStripe(unitAmount: number) {
  const updates: unknown[] = [];
  const stripe = {
    subscriptions: {
      retrieve: async () => ({
        id: "sub_1",
        items: { data: [{ id: "si_1", price: { unit_amount: unitAmount, product: "prod_1" } }] },
      }),
      update: async (_id: string, params: unknown) => updates.push(params),
    },
  } as unknown as Stripe;
  return { stripe, updates };
}

describe("Tidemark price by package and people", () => {
  it("moves a growing pool shop to the next tier, prorated", async () => {
    const { stripe, updates } = fakeStripe(7_900);
    expect(await syncSubscriptionPrice("co_1", stripe, priceDb("pool", 3))).toBe(14_900);
    expect(updates[0]).toMatchObject({
      items: [{ id: "si_1", price_data: { product: "prod_1", unit_amount: 14_900 } }],
      proration_behavior: "create_prorations",
    });
  });

  it("charges Both as Pool Maintenance plus $49, and leaves a right price alone", async () => {
    const { stripe, updates } = fakeStripe(7_900 + 4_900);
    expect(await syncSubscriptionPrice("co_1", stripe, priceDb("both", 2))).toBeNull();
    expect(updates).toHaveLength(0);
  });
});
