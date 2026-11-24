import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { autopayEvents, chargeInvoice, chargeRefusal, methodSummary } from "../src/server/autopay";
import {
  applyEvent,
  cardSetupCheckout,
  depositCheckout,
  forgetPayLater,
  invoiceCheckout,
  verifyEvent,
} from "../src/server/stripe";

// Autopay and Pay Over Time (docs/design/2026-11-16-autopay.md), with Stripe and the database
// faked as stripe.test.ts does.

const SECRET = "whsec_unit_test";

const invoiceDetails = {
  invoice_id: "i1",
  company_id: "c1",
  number: 2001,
  status: "sent",
  balance_cents: 16_400,
  company_name: "Blue Wave Pools",
  customer_email: "jane@example.com",
  stripe_account_id: "acct_shop",
  charges_enabled: true,
  payment_pending: false,
};

const visa = {
  id: "m1",
  kind: "card",
  brand: "visa",
  last4: "4242",
  exp_month: 4,
  exp_year: 2030,
  bank_name: null,
  label: "Visa •••• 4242",
  stripe_account_id: "acct_shop",
  stripe_customer_id: "cus_jane",
  stripe_payment_method_id: "pm_visa",
};

function autopayDetails(over: Record<string, unknown> = {}) {
  return {
    invoice_id: "i1",
    company_id: "c1",
    job_id: "j1",
    number: 2001,
    status: "sent",
    monthly: true,
    balance_cents: 16_400,
    autopay_status: null,
    autopay_tries: 0,
    payment_pending: false,
    company_name: "Blue Wave Pools",
    settings: {},
    timezone: "America/Phoenix",
    stripe_account_id: "acct_shop",
    charges_enabled: true,
    customer: { id: "cu1", name: "Jane Smith", email: "jane@example.com", autopay: true },
    method: visa,
    ...over,
  };
}

/** A fake database: RPC answers by name, and every call recorded. */
function fakeDb(
  answers: Record<string, unknown> = {},
  settings: Record<string, unknown> = {},
): { db: SupabaseClient; calls: { fn: string; args: Record<string, unknown> }[] } {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const seen = new Set<string>();
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    insert: async () => ({ data: null, error: null }),
    single: async () => ({ data: { settings }, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const db = {
    from: () => chain,
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === "stripe_event_seen")
        return { data: seen.has(args.event_id as string), error: null };
      if (fn === "stripe_claim_event") {
        seen.add(args.event_id as string);
        return { data: true, error: null };
      }
      return { data: fn in answers ? answers[fn] : null, error: null };
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}

/** A fake Stripe with the calls autopay makes. */
function fakeStripe(
  opts: {
    capabilities?: Record<string, string>;
    intent?: Partial<Stripe.PaymentIntent> | Error;
  } = {},
) {
  const sessions: { params: Stripe.Checkout.SessionCreateParams; opts: Stripe.RequestOptions }[] =
    [];
  const intents: { params: Stripe.PaymentIntentCreateParams; opts: Stripe.RequestOptions }[] = [];
  const customers: { params: Stripe.CustomerCreateParams; opts: Stripe.RequestOptions }[] = [];
  const detached: string[] = [];
  const stripe = {
    accounts: {
      retrieve: async () => {
        if (!opts.capabilities) throw new Error("no account");
        return { id: "acct_shop", capabilities: opts.capabilities };
      },
    },
    customers: {
      create: async (params: Stripe.CustomerCreateParams, o: Stripe.RequestOptions) => {
        customers.push({ params, opts: o });
        return { id: "cus_new" };
      },
    },
    checkout: {
      sessions: {
        create: async (params: Stripe.Checkout.SessionCreateParams, o: Stripe.RequestOptions) => {
          sessions.push({ params, opts: o });
          return { url: "https://checkout.stripe.test/cs_1", client_secret: "cs_1_secret" };
        },
      },
    },
    paymentIntents: {
      create: async (params: Stripe.PaymentIntentCreateParams, o: Stripe.RequestOptions) => {
        intents.push({ params, opts: o });
        if (opts.intent instanceof Error) throw opts.intent;
        return { id: "pi_1", status: "succeeded", ...opts.intent };
      },
      retrieve: async () => ({ id: "pi_1", payment_method: "pm_new" }),
    },
    setupIntents: {
      retrieve: async () => ({ id: "seti_1", payment_method: "pm_new" }),
    },
    paymentMethods: {
      retrieve: async () => ({
        id: "pm_new",
        type: "card",
        customer: "cus_jane",
        card: { brand: "visa", last4: "4242", exp_month: 4, exp_year: 2030 },
      }),
      detach: async (pm: string) => {
        detached.push(pm);
        return {};
      },
    },
  };
  return { stripe: stripe as unknown as Stripe, sessions, intents, customers, detached };
}

beforeEach(() => forgetPayLater());

describe("Pay Over Time", () => {
  it("adds Affirm and Klarna only when Stripe has them on and the amount qualifies", async () => {
    const f = fakeStripe({
      capabilities: {
        affirm_payments: "active",
        klarna_payments: "pending",
        link_payments: "active",
      },
    });
    await invoiceCheckout(
      "tok",
      "https://app.test",
      f.stripe,
      fakeDb({
        invoice_checkout_details: invoiceDetails,
      }).db,
      null,
    );
    expect(f.sessions[0]!.params.payment_method_types).toEqual([
      "card",
      "link",
      "us_bank_account",
      "affirm",
    ]);

    forgetPayLater();
    const small = fakeStripe({
      capabilities: { affirm_payments: "active", link_payments: "active" },
    });
    await invoiceCheckout(
      "tok",
      "https://app.test",
      small.stripe,
      fakeDb({
        invoice_checkout_details: { ...invoiceDetails, balance_cents: 4_000 },
      }).db,
      null,
    );
    expect(small.sessions[0]!.params.payment_method_types).toEqual([
      "card",
      "link",
      "us_bank_account",
    ]);
  });

  it("never offers them when the shop turned Pay Over Time off, or Stripe can't be asked", async () => {
    const off = fakeStripe({
      capabilities: {
        affirm_payments: "active",
        klarna_payments: "active",
        link_payments: "active",
      },
    });
    await depositCheckout(
      "tok",
      "https://app.test",
      off.stripe,
      fakeDb(
        {
          quote_checkout_details: {
            quote_id: "q1",
            company_id: "c1",
            number: 1,
            status: "accepted",
            deposit_cents: 65_730,
            company_name: "Blue Wave Pools",
            customer_email: null,
            stripe_account_id: "acct_shop",
            charges_enabled: true,
            deposit_paid: false,
          },
        },
        { pay_over_time: false },
      ).db,
      null,
    );
    expect(off.sessions[0]!.params.payment_method_types).toEqual([
      "card",
      "link",
      "us_bank_account",
    ]);

    forgetPayLater();
    const down = fakeStripe();
    await invoiceCheckout(
      "tok",
      "https://app.test",
      down.stripe,
      fakeDb({
        invoice_checkout_details: invoiceDetails,
      }).db,
      null,
    );
    // Link too: it is only sent once Stripe says the account has it on.
    expect(down.sessions[0]!.params.payment_method_types).toEqual(["card", "us_bank_account"]);
  });

  it("with the card fee on, Pay Over Time is its own choice without the fee", async () => {
    const f = fakeStripe({
      capabilities: { affirm_payments: "active", klarna_payments: "active" },
    });
    await invoiceCheckout(
      "tok",
      "https://app.test",
      f.stripe,
      fakeDb({ invoice_checkout_details: invoiceDetails }, { card_fee_bps: 300 }).db,
      null,
      "later",
    );
    const p = f.sessions[0]!.params;
    expect(p.payment_method_types).toEqual(["affirm", "klarna"]);
    expect(p.line_items).toHaveLength(1);
    expect(p.metadata).not.toHaveProperty("card_fee_cents");
  });
});

describe("Save for Autopay", () => {
  it("pays as the customer's Stripe Customer and keeps the card for later", async () => {
    const f = fakeStripe({ capabilities: { affirm_payments: "active" } });
    const { db, calls } = fakeDb({
      invoice_checkout_details: invoiceDetails,
      autopay_details: autopayDetails(),
      stripe_customer_for: null,
    });
    await invoiceCheckout("tok", "https://app.test", f.stripe, db, null, null, true);
    const p = f.sessions[0]!.params;
    expect(p.payment_method_types).toEqual(["card", "us_bank_account"]);
    expect(p.customer).toBe("cus_new");
    expect(p.customer_email).toBeUndefined();
    expect(p.payment_intent_data?.setup_future_usage).toBe("off_session");
    expect(p.metadata).toMatchObject({ save_for_autopay: "1", invoice_id: "i1" });
    expect(f.customers[0]!.opts).toMatchObject({ stripeAccount: "acct_shop" });
    expect(calls.find((c) => c.fn === "stripe_save_customer")?.args).toEqual({
      target_customer: "cu1",
      account: "acct_shop",
      stripe_customer: "cus_new",
    });
  });

  it("Request Card on File opens Checkout in setup mode, card or bank", async () => {
    const f = fakeStripe();
    await cardSetupCheckout(
      "card-tok",
      "https://app.test",
      f.stripe,
      fakeDb({
        card_request_details: {
          company_id: "c1",
          customer_id: "cu1",
          customer_name: "Jane Smith",
          customer_email: null,
          company: { name: "Blue Wave Pools" },
          stripe_account_id: "acct_shop",
          charges_enabled: true,
        },
        stripe_customer_for: "cus_jane",
      }).db,
      null,
    );
    const { params, opts } = f.sessions[0]!;
    expect(opts).toEqual({ stripeAccount: "acct_shop" });
    expect(params.mode).toBe("setup");
    expect(params.payment_method_types).toEqual(["card", "us_bank_account"]);
    expect(params.customer).toBe("cus_jane");
    expect(params.success_url).toBe("https://app.test/card/card-tok?saved=1");
    expect(params.setup_intent_data?.metadata).toMatchObject({ kind: "save_payment_method" });
    expect(params.line_items).toBeUndefined();
  });
});

describe("charging a saved card", () => {
  it("charges the balance and the card fee off-session on the shop's account, once per try", async () => {
    const f = fakeStripe();
    const { db, calls } = fakeDb({
      autopay_details: autopayDetails({ settings: { card_fee_bps: 300 } }),
      autopay_record: { paid_now: true, status: "paid" },
    });
    const r = await chargeInvoice("i1", {
      trigger: "send",
      origin: "https://app.test",
      stripe: f.stripe,
      db,
    });
    expect(r.outcome).toBe("succeeded");
    expect(r.message).toBe("Charged $168.92 to Visa •••• 4242.");
    const { params, opts } = f.intents[0]!;
    expect(params).toMatchObject({
      amount: 16_892,
      customer: "cus_jane",
      payment_method: "pm_visa",
      payment_method_types: ["card"],
      off_session: true,
      confirm: true,
    });
    expect(params.metadata).toMatchObject({
      kind: "autopay",
      invoice_id: "i1",
      card_fee_cents: "492",
    });
    expect(opts).toEqual({ stripeAccount: "acct_shop", idempotencyKey: "autopay-i1-1" });
    // The invoice records what was owed, not the fee.
    expect(calls.find((c) => c.fn === "autopay_record")?.args).toMatchObject({
      outcome: "succeeded",
      intent_id: "pi_1",
      amount: 16_400,
      pay_method: "card",
      paid_account: "acct_shop",
    });
  });

  it("a bank account has no card fee and is processing until it clears", async () => {
    const f = fakeStripe({ intent: { status: "processing" } });
    const bank = {
      ...visa,
      kind: "us_bank_account",
      brand: null,
      bank_name: "Chase",
      label: "Chase •••• 6789",
    };
    const { db, calls } = fakeDb({
      autopay_details: autopayDetails({ settings: { card_fee_bps: 300 }, method: bank }),
      autopay_record: { paid_now: false, status: "sent" },
    });
    const r = await chargeInvoice("i1", {
      trigger: "send",
      origin: "https://app.test",
      stripe: f.stripe,
      db,
    });
    expect(r.outcome).toBe("processing");
    expect(f.intents[0]!.params).toMatchObject({
      amount: 16_400,
      payment_method_types: ["us_bank_account"],
    });
    expect(calls.find((c) => c.fn === "autopay_record")?.args).toMatchObject({
      outcome: "processing",
      pay_method: "ach",
    });
  });

  it("a decline is recorded with the next try, on the shop's schedule", async () => {
    const decline = Object.assign(new Error("Your card was declined."), {
      type: "StripeCardError",
      payment_intent: { id: "pi_declined" },
    });
    const f = fakeStripe({ intent: decline });
    const { db, calls } = fakeDb({
      autopay_details: autopayDetails(),
      autopay_record: { paid_now: false, status: "sent" },
    });
    const r = await chargeInvoice("i1", {
      trigger: "send",
      origin: "https://app.test",
      stripe: f.stripe,
      db,
      now: new Date("2026-12-01T18:00:00Z"),
    });
    expect(r.outcome).toBe("failed");
    expect(calls.find((c) => c.fn === "autopay_record")?.args).toMatchObject({
      outcome: "failed",
      intent_id: "pi_declined",
      failure: "Your card was declined.",
      next_try: "2026-12-04",
    });
  });

  it("charges automatically only monthly invoices of customers on autopay", async () => {
    for (const over of [
      { monthly: false },
      { autopay_tries: 1 },
      { customer: { id: "cu1", name: "Jane", email: null, autopay: false } },
      { settings: { autopay: false } },
      { method: null },
    ]) {
      const f = fakeStripe();
      const { db } = fakeDb({ autopay_details: autopayDetails(over) });
      const r = await chargeInvoice("i1", {
        trigger: "send",
        origin: "https://app.test",
        stripe: f.stripe,
        db,
      });
      expect(r.outcome).toBe("skipped");
      expect(f.intents).toHaveLength(0);
    }
  });

  it("Charge Card on File works without autopay, and says why it can't", () => {
    const off = autopayDetails({
      monthly: false,
      customer: { id: "cu1", name: "J", email: null, autopay: false },
    });
    expect(chargeRefusal(off as never, false)).toBeNull();
    expect(chargeRefusal(off as never, true)).toBe("Autopay is off for this customer.");
    expect(chargeRefusal(autopayDetails({ status: "paid" }) as never, false)).toBe(
      "This invoice is already paid.",
    );
    expect(chargeRefusal(autopayDetails({ payment_pending: true }) as never, false)).toBe(
      "A payment is already processing.",
    );
    expect(
      chargeRefusal(
        autopayDetails({ method: { ...visa, stripe_account_id: "acct_old" } }) as never,
        false,
      ),
    ).toMatch(/different Stripe account/);
  });
});

function signed(event: object) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return verifyEvent(payload, header, [SECRET]);
}

describe("webhooks", () => {
  it("keeps only a summary of a saved card", () => {
    expect(
      methodSummary({
        id: "pm_1",
        type: "card",
        card: { brand: "visa", last4: "4242", exp_month: 4, exp_year: 2030 },
      } as unknown as Stripe.PaymentMethod),
    ).toEqual({
      kind: "card",
      brand: "visa",
      last4: "4242",
      exp_month: 4,
      exp_year: 2030,
      bank_name: null,
    });
  });

  it("a Request Card on File session saves the method, turns autopay on and detaches the old", async () => {
    const f = fakeStripe();
    const { db, calls } = fakeDb({
      autopay_save_method: { replaced: ["pm_old"], label: "Visa •••• 4242" },
    });
    const event = signed({
      id: "evt_setup",
      object: "event",
      type: "checkout.session.completed",
      account: "acct_shop",
      data: {
        object: {
          id: "cs_setup",
          object: "checkout.session",
          mode: "setup",
          setup_intent: "seti_1",
          customer: "cus_jane",
          metadata: { kind: "save_payment_method", customer_id: "cu1", company_id: "c1" },
        },
      },
    });
    expect(
      await applyEvent(event, db, undefined, autopayEvents("https://app.test", f.stripe)),
    ).toBe("applied");
    expect(calls.find((c) => c.fn === "autopay_save_method")?.args).toMatchObject({
      target_customer: "cu1",
      account: "acct_shop",
      stripe_customer: "cus_jane",
      payment_method: "pm_new",
      method_kind: "card",
      last_four: "4242",
      turn_on: true,
    });
    expect(f.detached).toEqual(["pm_old"]);
  });

  it("a bank charge settling pays the invoice; other payment intents are left alone", async () => {
    const f = fakeStripe();
    const { db, calls } = fakeDb({
      autopay_settle: { invoice_id: "i1", company_id: "c1", paid_now: true, changed: true },
    });
    const settle = (id: string, kind: string) =>
      signed({
        id,
        object: "event",
        type: "payment_intent.succeeded",
        account: "acct_shop",
        data: {
          object: { id: "pi_bank", object: "payment_intent", metadata: { kind, invoice_id: "i1" } },
        },
      });
    expect(
      await applyEvent(
        settle("evt_a", "autopay"),
        db,
        undefined,
        autopayEvents("https://app.test", f.stripe),
      ),
    ).toBe("applied");
    expect(calls.find((c) => c.fn === "autopay_settle")?.args).toMatchObject({
      intent_id: "pi_bank",
      pay_status: "succeeded",
      paid_account: "acct_shop",
    });
    const other = fakeDb();
    expect(
      await applyEvent(
        settle("evt_b", "invoice_payment"),
        other.db,
        undefined,
        autopayEvents("https://app.test", f.stripe),
      ),
    ).toBe("ignored");
    expect(other.calls.some((c) => c.fn === "autopay_settle")).toBe(false);
  });
});
