import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { Refusal } from "@/server/failures";
import { recordChargeRefund, refundPayment } from "@/server/refunds";

// Refunds of a shop's invoice payments (owner, 2026-11-24): the person's own client checks
// who may refund, Stripe refunds on the shop's account, and the server records what Stripe says.

const info = {
  payment_id: "pay_1",
  invoice_id: "inv_1",
  company_id: "co_1",
  intent_id: "pi_1",
  amount_cents: 8000,
  refunded_cents: 0,
  method: "card",
  account: "acct_shop",
};

function fakes(chargeRefunded: number) {
  const calls: { refunds: unknown[]; opts: unknown[]; rpcs: { name: string; args: unknown }[] } = {
    refunds: [],
    opts: [],
    rpcs: [],
  };
  const user = {
    rpc: async (name: string, args: unknown) => {
      calls.rpcs.push({ name, args });
      return { data: info, error: null };
    },
  } as unknown as SupabaseClient;
  const server = {
    rpc: async (name: string, args: unknown) => {
      calls.rpcs.push({ name, args });
      return {
        data: {
          refunded_cents: Math.min(chargeRefunded, 8000),
          status: chargeRefunded >= 8240 ? "refunded" : "succeeded",
          changed: true,
        },
        error: null,
      };
    },
  } as unknown as SupabaseClient;
  const stripe = {
    refunds: {
      create: async (params: { amount?: number }, opts: unknown) => {
        calls.refunds.push(params);
        calls.opts.push(opts);
        return { id: "re_1", amount: params.amount ?? 8240, status: "succeeded", charge: "ch_1" };
      },
    },
    charges: {
      retrieve: async () => ({
        id: "ch_1",
        payment_intent: "pi_1",
        amount: 8240,
        amount_refunded: chargeRefunded,
      }),
    },
  } as unknown as Stripe;
  return { calls, user, server, stripe };
}

describe("refunding a shop's payment", () => {
  it("refunds part on the shop's own account and records what Stripe reports", async () => {
    const f = fakes(2000);
    const r = await refundPayment(f.user, "pay_1", 2000, { stripe: f.stripe, server: f.server });
    expect(f.calls.refunds[0]).toMatchObject({ payment_intent: "pi_1", amount: 2000 });
    expect(f.calls.opts[0]).toMatchObject({ stripeAccount: "acct_shop" });
    expect(f.calls.rpcs.map((c) => c.name)).toEqual([
      "payment_refund_info",
      "stripe_record_refund",
    ]);
    expect(f.calls.rpcs[1]!.args).toEqual({
      intent_id: "pi_1",
      charge_refunded: 2000,
      charge_amount: 8240,
      paid_account: "acct_shop",
    });
    expect(r).toEqual({ refunded_cents: 2000, status: "succeeded", message: "Refunded $20.00." });
  });

  it("refunds all that's left, card fee and all, when no amount is given", async () => {
    const f = fakes(8240);
    const r = await refundPayment(f.user, "pay_1", null, { stripe: f.stripe, server: f.server });
    expect(f.calls.refunds[0]).not.toHaveProperty("amount");
    expect(r.status).toBe("refunded");
  });

  it("refuses more than is left before calling Stripe", async () => {
    const f = fakes(0);
    await expect(
      refundPayment(f.user, "pay_1", 9000, { stripe: f.stripe, server: f.server }),
    ).rejects.toThrow(new Refusal("Refund $80.00 or less."));
    expect(f.calls.refunds).toHaveLength(0);
  });

  it("ignores a charge with no payment intent", async () => {
    const f = fakes(0);
    expect(
      await recordChargeRefund(
        f.server,
        { payment_intent: null } as unknown as Stripe.Charge,
        "acct",
      ),
    ).toBeNull();
  });
});
