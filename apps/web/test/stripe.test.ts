import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  BadSignature,
  CheckoutRefused,
  applyEvent,
  depositCheckout,
  invoiceCheckout,
  registerPaymentDomain,
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
        case "stripe_record_invoice_payment": {
          const before = payments.get(args.session_id as string);
          const next =
            !before || (before === "pending" && args.pay_status !== "pending")
              ? (args.pay_status as string)
              : before;
          payments.set(args.session_id as string, next);
          const paidNow = next === "succeeded" && before !== "succeeded";
          return {
            data: { payment: next, status: paidNow ? "paid" : "sent", paid_now: paidNow },
            error: null,
          };
        }
        case "quote_checkout_details":
        case "invoice_checkout_details":
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

const session = (
  id: string,
  payment_status: string,
  type: string,
  eventId: string,
  metadata: Record<string, string> = { kind: "quote_deposit", quote_id: "q1", company_id: "c1" },
) =>
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
        metadata,
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

  it("records an invoice payment and asks for the receipt once, when it is paid in full", async () => {
    const { db, calls, payments } = fakeDb();
    const paid: string[] = [];
    const onPaid = async (id: string) => paid.push(id);
    const meta = { kind: "invoice_payment", invoice_id: "i1", company_id: "c1" };
    await applyEvent(
      session("cs_inv", "unpaid", "checkout.session.completed", "evt_i1", meta),
      db,
      onPaid,
    );
    expect(payments.get("cs_inv")).toBe("pending");
    expect(paid).toEqual([]);
    await applyEvent(
      session("cs_inv", "paid", "checkout.session.async_payment_succeeded", "evt_i2", meta),
      db,
      onPaid,
    );
    expect(paid).toEqual(["i1"]);
    expect(calls.find((c) => c.fn === "stripe_record_invoice_payment")?.args).toMatchObject({
      target_invoice: "i1",
      session_id: "cs_inv",
      pay_method: "ach",
    });
    expect(calls.some((c) => c.fn === "stripe_record_quote_payment")).toBe(false);
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
            return { url: "https://checkout.stripe.test/cs_1", client_secret: "cs_1_secret" };
          },
        },
      },
    };
    return { stripe: stripe as unknown as Stripe, created };
  }

  it("charges the deposit on the shop's account with card, Link, and bank options", async () => {
    const { stripe, created } = fakeStripe();
    const start = await depositCheckout(
      "tok",
      "https://app.test",
      stripe,
      fakeDb(details).db,
      null,
    );
    expect(start).toEqual({ kind: "page", url: "https://checkout.stripe.test/cs_1" });
    const { params, opts } = created[0]!;
    expect(opts).toEqual({ stripeAccount: "acct_shop" });
    expect(params.payment_method_types).toEqual(["card", "link", "us_bank_account"]);
    expect(params.line_items?.[0]?.price_data?.unit_amount).toBe(65_730);
    expect(params.metadata).toEqual({ kind: "quote_deposit", quote_id: "q1", company_id: "c1" });
    expect(params.success_url).toBe("https://app.test/q/tok?paid=1");
    expect(params.cancel_url).toBe("https://app.test/q/tok");
    expect(params.ui_mode).toBeUndefined();
  });

  it("with a publishable key, shows Checkout on our page and returns to it", async () => {
    const { stripe, created } = fakeStripe();
    const start = await depositCheckout(
      "tok",
      "https://app.test",
      stripe,
      fakeDb(details).db,
      "pk_test_1",
    );
    expect(start).toEqual({
      kind: "embedded",
      clientSecret: "cs_1_secret",
      account: "acct_shop",
      publishableKey: "pk_test_1",
    });
    const { params, opts } = created[0]!;
    expect(opts).toEqual({ stripeAccount: "acct_shop" });
    expect(params.ui_mode).toBe("embedded_page");
    expect(params.return_url).toBe("https://app.test/q/tok?paid=1");
    expect(params.success_url).toBeUndefined();
    expect(params.cancel_url).toBeUndefined();
    expect(params.metadata).toEqual({ kind: "quote_deposit", quote_id: "q1", company_id: "c1" });
  });

  it("refuses before acceptance, when paid, or when the shop can't take payments", async () => {
    const { stripe } = fakeStripe();
    for (const over of [{ status: "sent" }, { deposit_paid: true }, { charges_enabled: false }]) {
      await expect(
        depositCheckout(
          "tok",
          "https://app.test",
          stripe,
          fakeDb({ ...details, ...over }).db,
          null,
        ),
      ).rejects.toBeInstanceOf(CheckoutRefused);
    }
  });
});

describe("invoice checkout", () => {
  const details = {
    invoice_id: "i1",
    company_id: "c1",
    number: 2001,
    status: "partially_paid",
    balance_cents: 45_730,
    company_name: "Demo Leak Co.",
    customer_email: "sam@example.com",
    stripe_account_id: "acct_shop",
    charges_enabled: true,
    payment_pending: false,
  };

  function fakeStripe() {
    const created: Stripe.Checkout.SessionCreateParams[] = [];
    const stripe = {
      checkout: {
        sessions: {
          async create(params: Stripe.Checkout.SessionCreateParams) {
            created.push(params);
            return { url: "https://checkout.stripe.test/cs_2", client_secret: "cs_2_secret" };
          },
        },
      },
    };
    return { stripe: stripe as unknown as Stripe, created };
  }

  it("charges what is still owed", async () => {
    const { stripe, created } = fakeStripe();
    await invoiceCheckout("tok", "https://app.test", stripe, fakeDb(details).db, null);
    expect(created[0]!.line_items?.[0]?.price_data?.unit_amount).toBe(45_730);
    expect(created[0]!.metadata).toEqual({
      kind: "invoice_payment",
      invoice_id: "i1",
      company_id: "c1",
    });
    expect(created[0]!.success_url).toBe("https://app.test/i/tok?paid=1");
  });

  it("embedded, it returns to the invoice page", async () => {
    const { stripe, created } = fakeStripe();
    const start = await invoiceCheckout(
      "tok",
      "https://app.test",
      stripe,
      fakeDb(details).db,
      "pk",
    );
    expect(start).toMatchObject({ kind: "embedded", clientSecret: "cs_2_secret" });
    expect(created[0]!.ui_mode).toBe("embedded_page");
    expect(created[0]!.return_url).toBe("https://app.test/i/tok?paid=1");
  });

  it("refuses when paid, void, processing, or the shop can't take payments", async () => {
    const { stripe } = fakeStripe();
    for (const over of [
      { status: "paid", balance_cents: 0 },
      { status: "void" },
      { payment_pending: true },
      { charges_enabled: false },
    ]) {
      await expect(
        invoiceCheckout(
          "tok",
          "https://app.test",
          stripe,
          fakeDb({ ...details, ...over }).db,
          null,
        ),
      ).rejects.toBeInstanceOf(CheckoutRefused);
    }
  });
});

describe("payment domain", () => {
  function fakeStripe(fail = false) {
    const calls: { params: unknown; opts: unknown }[] = [];
    const stripe = {
      paymentMethodDomains: {
        async create(params: unknown, opts: unknown) {
          calls.push({ params, opts });
          if (fail) throw new Error("already exists");
          return {};
        },
      },
    };
    return { stripe: stripe as unknown as Stripe, calls };
  }

  it("registers the site's domain on the shop's account for Apple Pay and Google Pay", async () => {
    const { stripe, calls } = fakeStripe();
    await registerPaymentDomain(stripe, "acct_shop", "https://app.tidemark.app");
    expect(calls).toEqual([
      {
        params: { domain_name: "app.tidemark.app" },
        opts: { stripeAccount: "acct_shop", idempotencyKey: "domain-acct_shop-app.tidemark.app" },
      },
    ]);
  });

  it("skips local addresses and never throws", async () => {
    const { stripe, calls } = fakeStripe(true);
    await registerPaymentDomain(stripe, "acct_shop", "http://localhost:3000");
    await registerPaymentDomain(stripe, "acct_shop", "http://127.0.0.1:3000");
    expect(calls).toHaveLength(0);
    await expect(
      registerPaymentDomain(stripe, "acct_shop", "https://app.tidemark.app"),
    ).resolves.toBeUndefined();
  });
});
