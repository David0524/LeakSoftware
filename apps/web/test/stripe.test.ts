import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  BadSignature,
  CheckoutRefused,
  applyEvent,
  depositCheckoutUrl,
  verifyEvent,
} from "../src/server/stripe";

const SECRET = "whsec_unit_test";

/** A fake database that records RPC calls and mimics the event and payment functions. */
function fakeDb(details: Record<string, unknown> | null = null) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const seen = new Set<string>();
  const payments = new Map<string, string>();
  const db = {
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      switch (fn) {
        case "stripe_event_seen":
          return { data: seen.has(args.event_id as string), error: null };
        case "stripe_claim_event":
          seen.add(args.event_id as string);
          return { data: true, error: null };
        case "stripe_record_quote_payment": {
          const before = payments.get(args.session_id as string);
          const next =
            !before || (before === "pending" && args.pay_status !== "pending")
              ? (args.pay_status as string)
              : before;
          payments.set(args.session_id as string, next);
          return { data: next, error: null };
        }
        case "quote_checkout_details":
          return { data: details, error: null };
        default:
          return { data: null, error: null };
      }
    },
  };
  return { db: db as unknown as SupabaseClient, calls, payments };
}

function signed(event: object) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return verifyEvent(payload, header, [SECRET]);
}

const session = (id: string, payment_status: string, type: string, eventId: string) =>
  signed({
    id: eventId,
    object: "event",
    type,
    account: "acct_shop",
    data: {
      object: {
        id,
        object: "checkout.session",
        payment_status,
        amount_total: 65_730,
        payment_intent: "pi_1",
        metadata: { kind: "quote_deposit", quote_id: "q1", company_id: "c1" },
      },
    },
  });

describe("Stripe webhooks", () => {
  it("rejects a missing or wrong signature", () => {
    expect(() => verifyEvent("{}", null, [SECRET])).toThrow(BadSignature);
    const header = Stripe.webhooks.generateTestHeaderString({
      payload: "{}",
      secret: "whsec_other",
    });
    expect(() => verifyEvent("{}", header, [SECRET])).toThrow(BadSignature);
  });

  it("records a card deposit as paid", async () => {
    const { db, calls } = fakeDb();
    expect(
      await applyEvent(session("cs_card", "paid", "checkout.session.completed", "evt_1"), db),
    ).toBe("applied");
    expect(calls.find((c) => c.fn === "stripe_record_quote_payment")?.args).toMatchObject({
      target_quote: "q1",
      session_id: "cs_card",
      amount: 65_730,
      pay_method: "card",
      pay_status: "succeeded",
    });
  });

  it("keeps a bank deposit pending until it clears, and a replay changes nothing", async () => {
    const { db, payments, calls } = fakeDb();
    const completed = session("cs_ach", "unpaid", "checkout.session.completed", "evt_a");
    await applyEvent(completed, db);
    expect(payments.get("cs_ach")).toBe("pending");
    await applyEvent(
      session("cs_ach", "paid", "checkout.session.async_payment_succeeded", "evt_b"),
      db,
    );
    expect(payments.get("cs_ach")).toBe("succeeded");

    const before = calls.length;
    expect(await applyEvent(completed, db)).toBe("duplicate");
    expect(calls.slice(before).map((c) => c.fn)).toEqual(["stripe_event_seen"]);
    expect(payments.get("cs_ach")).toBe("succeeded");
  });

  it("saves a connected account's state from account.updated", async () => {
    const { db, calls } = fakeDb();
    const event = signed({
      id: "evt_acct",
      object: "event",
      type: "account.updated",
      data: {
        object: {
          id: "acct_shop",
          object: "account",
          charges_enabled: true,
          payouts_enabled: false,
          details_submitted: true,
        },
      },
    });
    await applyEvent(event, db);
    expect(calls.find((c) => c.fn === "stripe_save_account")?.args).toEqual({
      target_company: null,
      account_id: "acct_shop",
      charges: true,
      payouts: false,
      submitted: true,
    });
  });

  it("ignores other events but still records them", async () => {
    const { db, calls } = fakeDb();
    const event = signed({
      id: "evt_x",
      object: "event",
      type: "customer.created",
      data: { object: {} },
    });
    expect(await applyEvent(event, db)).toBe("ignored");
    expect(calls.map((c) => c.fn)).toEqual(["stripe_event_seen", "stripe_claim_event"]);
  });
});

describe("deposit checkout", () => {
  const details = {
    quote_id: "q1",
    company_id: "c1",
    number: 1042,
    status: "accepted",
    deposit_cents: 65_730,
    company_name: "Demo Leak Co.",
    customer_email: "sam@example.com",
    stripe_account_id: "acct_shop",
    charges_enabled: true,
    deposit_paid: false,
  };

  function fakeStripe() {
    const created: { params: Stripe.Checkout.SessionCreateParams; opts: Stripe.RequestOptions }[] =
      [];
    const stripe = {
      checkout: {
        sessions: {
          async create(params: Stripe.Checkout.SessionCreateParams, opts: Stripe.RequestOptions) {
            created.push({ params, opts });
            return { url: "https://checkout.stripe.test/cs_1" };
          },
        },
      },
    };
    return { stripe: stripe as unknown as Stripe, created };
  }

  it("charges the deposit on the shop's account with card and bank options", async () => {
    const { stripe, created } = fakeStripe();
    const url = await depositCheckoutUrl("tok", "https://app.test", stripe, fakeDb(details).db);
    expect(url).toBe("https://checkout.stripe.test/cs_1");
    const { params, opts } = created[0]!;
    expect(opts).toEqual({ stripeAccount: "acct_shop" });
    expect(params.payment_method_types).toEqual(["card", "us_bank_account"]);
    expect(params.line_items?.[0]?.price_data?.unit_amount).toBe(65_730);
    expect(params.metadata).toEqual({ kind: "quote_deposit", quote_id: "q1", company_id: "c1" });
    expect(params.success_url).toBe("https://app.test/q/tok?paid=1");
  });

  it("refuses before acceptance, when paid, or when the shop can't take payments", async () => {
    const { stripe } = fakeStripe();
    for (const over of [{ status: "sent" }, { deposit_paid: true }, { charges_enabled: false }]) {
      await expect(
        depositCheckoutUrl("tok", "https://app.test", stripe, fakeDb({ ...details, ...over }).db),
      ).rejects.toBeInstanceOf(CheckoutRefused);
    }
  });
});
