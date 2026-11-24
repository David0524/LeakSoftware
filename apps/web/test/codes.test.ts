import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { applyBillingEvent, promoCoupon, rewardReferral } from "../src/server/billing";

// Promo and referral codes (owner, 2026-11-23): the percent off's Stripe coupon, and the
// referring shop's free month on the new shop's first real payment.

function couponStripe(existing: string[] = []) {
  const made: Record<string, unknown>[] = [];
  const stripe = {
    coupons: {
      retrieve: async (id: string) => {
        if (!existing.includes(id))
          throw Object.assign(new Error("No such coupon"), { code: "resource_missing" });
        return { id };
      },
      create: async (params: Record<string, unknown>) => {
        made.push(params);
        return { id: params.id };
      },
    },
  } as unknown as Stripe;
  return { stripe, made };
}

describe("the promo code's Stripe coupon", () => {
  const now = new Date("2026-11-23T18:00:00Z");

  it("lasts the trial's whole months plus the paid months", async () => {
    const { stripe, made } = couponStripe();
    const id = await promoCoupon(stripe, 20, 12, new Date("2027-02-24T06:59:59Z"), now);
    expect(id).toBe("sundeckpro_20off_15mo");
    expect(made).toEqual([
      {
        id: "sundeckpro_20off_15mo",
        name: "Sundeck Pro 20% off for 12 months",
        percent_off: 20,
        duration: "repeating",
        duration_in_months: 15,
      },
    ]);
  });

  it("is made once and reused", async () => {
    const { stripe, made } = couponStripe(["sundeckpro_10off_forever"]);
    expect(await promoCoupon(stripe, 10, null, null, now)).toBe("sundeckpro_10off_forever");
    expect(made).toHaveLength(0);
  });
});

/** Answers the reward's reads: two subscription rows (by customer, by company), the shop's name and settings. */
function rewardDb(referrer: Record<string, unknown> | null, referred: Record<string, unknown>) {
  const rpcs: { name: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpcs,
    from(table: string) {
      let key = "";
      const q = {
        select: () => q,
        eq: (column: string) => {
          key = column;
          return q;
        },
        maybeSingle: async () => ({
          data:
            table === "subscription"
              ? key === "stripe_customer_id"
                ? referred
                : referrer
              : { name: "Blue Wave Pools", settings: { services: "pool" } },
          error: null,
        }),
        single: async () => ({ data: { settings: { services: "pool" } }, error: null }),
        then: (done: (v: unknown) => unknown) => done({ count: 1, error: null }),
      };
      return q;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      // The shop's price list and own price: none, so the default prices.
      if (name === "shop_billing_price") return { data: null, error: null };
      rpcs.push({ name, args });
      return { data: true, error: null };
    },
  };
  return db as unknown as SupabaseClient & { rpcs: typeof rpcs };
}

function creditStripe() {
  const credits: { customer: string; params: Record<string, unknown>; key?: string }[] = [];
  const stripe = {
    customers: {
      createBalanceTransaction: async (
        customer: string,
        params: Record<string, unknown>,
        options?: { idempotencyKey?: string },
      ) => {
        credits.push({ customer, params, key: options?.idempotencyKey });
        return { id: "cbtxn_1" };
      },
    },
  } as unknown as Stripe;
  return { stripe, credits };
}

const paid = (amount: number) =>
  ({ id: "in_1", customer: "cus_new", amount_paid: amount }) as unknown as Stripe.Invoice;
const referred = { company_id: "co_new", referred_by: "co_ref", referral_rewarded_at: null };

describe("Give a Month, Get a Month", () => {
  it("credits a subscribed referrer a month at its price, once", async () => {
    const db = rewardDb(
      {
        plan: "standard",
        status: "active",
        stripe_customer_id: "cus_ref",
        stripe_subscription_id: "sub_ref",
      },
      referred,
    );
    const { stripe, credits } = creditStripe();
    expect(await rewardReferral(paid(7_900), db, stripe)).toBe("credit");
    expect(credits).toEqual([
      {
        customer: "cus_ref",
        params: {
          amount: -7_900,
          currency: "usd",
          description: "A free month for referring Blue Wave Pools",
          metadata: { kind: "referral_reward", referred_company_id: "co_new" },
        },
        key: "referral_reward_co_new",
      },
    ]);
    expect(db.rpcs).toEqual([
      { name: "referral_reward", args: { referred: "co_new", reward: "credit", cents: 7_900 } },
    ]);
  });

  it("adds a month to the trial of a referrer that hasn't subscribed", async () => {
    const db = rewardDb(
      {
        plan: "standard",
        status: "trialing",
        stripe_customer_id: null,
        stripe_subscription_id: null,
      },
      referred,
    );
    const { stripe, credits } = creditStripe();
    expect(await rewardReferral(paid(7_900), db, stripe)).toBe("trial");
    expect(credits).toHaveLength(0);
    expect(db.rpcs[0]!.args).toMatchObject({ reward: "trial", cents: null });
  });

  it("waits for a real payment, and skips shops already rewarded or not referred", async () => {
    const { stripe, credits } = creditStripe();
    const free = rewardDb({ plan: "standard", status: "active" }, referred);
    expect(await rewardReferral(paid(0), free, stripe)).toBeNull();
    const done = rewardDb(null, { ...referred, referral_rewarded_at: "2026-11-01T00:00:00Z" });
    expect(await rewardReferral(paid(7_900), done, stripe)).toBeNull();
    const plain = rewardDb(null, { ...referred, referred_by: null });
    expect(await rewardReferral(paid(7_900), plain, stripe)).toBeNull();
    expect(credits).toHaveLength(0);
    expect([...free.rpcs, ...done.rpcs, ...plain.rpcs]).toHaveLength(0);
  });

  it("gives a demo referrer nothing, recorded", async () => {
    const db = rewardDb({ plan: "demo", status: "active" }, referred);
    const { stripe } = creditStripe();
    expect(await rewardReferral(paid(7_900), db, stripe)).toBe("none");
  });

  it("handles invoice.paid on the platform account only", async () => {
    const db = rewardDb({ plan: "standard", status: "trialing" }, referred);
    const event = (account?: string) =>
      ({
        id: "evt_1",
        type: "invoice.paid",
        account,
        data: { object: paid(7_900) },
      }) as unknown as Stripe.Event;
    expect(await applyBillingEvent(event("acct_shop"), db, null)).toBe(false);
    expect(db.rpcs).toHaveLength(0);
    expect(await applyBillingEvent(event(), db, null)).toBe(true);
    expect(db.rpcs[0]!.args).toMatchObject({ reward: "trial" });
  });
});
