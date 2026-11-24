import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { cardImportPreview, holderMethod, importCards } from "../src/server/card-import";
import { Refusal } from "../src/server/failures";

// Import Saved Cards (core card-import.ts), with Stripe and the database faked.

const card = (id: string, exp_year = 2029, last4 = "4242") =>
  ({
    id,
    type: "card",
    card: { brand: "visa", last4, exp_month: 6, exp_year },
  }) as Stripe.PaymentMethod;

interface FakeCustomer {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  default_pm?: string | null;
  methods: Stripe.PaymentMethod[];
}

function fakeStripe(customers: FakeCustomer[]) {
  const detached: string[] = [];
  const opts: unknown[] = [];
  const asCustomer = (c: FakeCustomer) =>
    ({
      id: c.id,
      name: c.name ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      invoice_settings: { default_payment_method: c.default_pm ?? null },
      default_source: null,
    }) as unknown as Stripe.Customer;
  const stripe = {
    customers: {
      list: (_: unknown, o: unknown) => {
        opts.push(o);
        return (async function* () {
          for (const c of customers) yield asCustomer(c);
        })();
      },
      retrieve: async (id: string, _: unknown, o: unknown) => {
        opts.push(o);
        const c = customers.find((x) => x.id === id);
        if (!c) throw new Error("No such customer");
        return asCustomer(c);
      },
      listPaymentMethods: async (id: string, _: unknown, o: unknown) => {
        opts.push(o);
        return { data: customers.find((x) => x.id === id)?.methods ?? [] };
      },
    },
    paymentMethods: {
      detach: async (id: string) => {
        detached.push(id);
        return {};
      },
    },
  };
  return { stripe: stripe as unknown as Stripe, detached, opts };
}

function fakeDb(opts: {
  account?: { stripe_account_id: string; charges_enabled: boolean } | null;
  customers?: Record<string, unknown>[];
  methods?: Record<string, unknown>[];
  save?: unknown;
}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const from = (table: string) => {
    const rows =
      table === "customer"
        ? (opts.customers ?? [])
        : table === "customer_payment_method"
          ? (opts.methods ?? [])
          : [];
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      range: async () => ({ data: rows, error: null }),
      maybeSingle: async () => ({
        data:
          opts.account === undefined
            ? { stripe_account_id: "acct_shop", charges_enabled: true }
            : opts.account,
        error: null,
      }),
    };
    return chain;
  };
  const db = {
    from,
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === "autopay_save_method")
        return { data: opts.save === undefined ? { replaced: [] } : opts.save, error: null };
      return { data: null, error: null };
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}

const TZ = "America/Los_Angeles";

describe("holderMethod", () => {
  const { stripe } = fakeStripe([]);
  const customer = (default_pm: string | null) =>
    ({
      id: "cus_1",
      invoice_settings: { default_payment_method: default_pm },
      default_source: null,
    }) as unknown as Stripe.Customer;

  it("brings the default card, or the first unexpired one when the default has expired", async () => {
    const f = fakeStripe([
      { id: "cus_1", methods: [card("pm_old", 2023), card("pm_new"), card("pm_default", 2030)] },
    ]);
    expect(
      (await holderMethod(f.stripe, "acct_shop", customer("pm_default"), "2026-11-24"))?.id,
    ).toBe("pm_default");
    const g = fakeStripe([{ id: "cus_1", methods: [card("pm_old", 2023), card("pm_new")] }]);
    expect((await holderMethod(g.stripe, "acct_shop", customer("pm_old"), "2026-11-24"))?.id).toBe(
      "pm_new",
    );
    expect(await holderMethod(stripe, "acct_shop", customer(null), "2026-11-24")).toBeNull();
  });
});

describe("cardImportPreview", () => {
  it("reads the copied customers on the shop's account and matches them", async () => {
    const f = fakeStripe([
      { id: "cus_jane", email: "jane@example.com", methods: [card("pm_jane")] },
      { id: "cus_who", name: "Somebody", methods: [card("pm_who")] },
      { id: "cus_none", email: "none@example.com", methods: [] },
    ]);
    const { db } = fakeDb({
      customers: [
        {
          id: "c-jane",
          name: "Jane Smith",
          company_name: null,
          email: "jane@example.com",
          phone: null,
        },
        { id: "c-bob", name: "Bob Lee", company_name: null, email: null, phone: "7025550100" },
      ],
    });
    const p = await cardImportPreview("co1", TZ, { stripe: f.stripe, db });
    expect(p.account).toBe("acct_shop");
    expect(
      f.opts.every((o) => (o as { stripeAccount: string }).stripeAccount === "acct_shop"),
    ).toBe(true);
    expect(p.plan.ready.map((r) => [r.holder.stripe_customer_id, r.customer_id])).toEqual([
      ["cus_jane", "c-jane"],
    ]);
    expect(p.plan.needsMatch.map((r) => r.holder.stripe_customer_id)).toEqual(["cus_who"]);
    expect(p.plan.withoutCard).toBe(1);
    expect(p.customers.map((c) => [c.name, c.detail])).toEqual([
      ["Bob Lee", "7025550100"],
      ["Jane Smith", "jane@example.com"],
    ]);
  });

  it("refuses until the shop can take payments", async () => {
    const { db } = fakeDb({ account: { stripe_account_id: "acct_shop", charges_enabled: false } });
    await expect(
      cardImportPreview("co1", TZ, { stripe: fakeStripe([]).stripe, db }),
    ).rejects.toBeInstanceOf(Refusal);
  });
});

describe("importCards", () => {
  it("saves the card Stripe has, not one from the browser, and turns autopay on", async () => {
    const f = fakeStripe([{ id: "cus_jane", methods: [card("pm_jane", 2029, "1111")] }]);
    const { db, calls } = fakeDb({ save: { replaced: ["pm_older"] } });
    const r = await importCards(
      "co1",
      TZ,
      [{ stripe_customer_id: "cus_jane", customer_id: "c-jane" }],
      {
        stripe: f.stripe,
        db,
      },
    );
    expect(r).toEqual({ imported: 1, failed: [] });
    expect(calls.map((c) => c.fn)).toEqual(["autopay_save_method", "stripe_save_customer"]);
    expect(calls[1]!.args).toEqual({
      target_customer: "c-jane",
      account: "acct_shop",
      stripe_customer: "cus_jane",
    });
    expect(calls[0]!.args).toMatchObject({
      target_customer: "c-jane",
      account: "acct_shop",
      stripe_customer: "cus_jane",
      payment_method: "pm_jane",
      last_four: "1111",
      turn_on: true,
    });
    // The card it replaced leaves Stripe, as when a customer saves a new one.
    expect(f.detached).toEqual(["pm_older"]);
  });

  it("reports the ones it couldn't import and carries on with the rest", async () => {
    const f = fakeStripe([
      { id: "cus_ok", methods: [card("pm_ok")] },
      { id: "cus_empty", methods: [] },
      { id: "cus_other", methods: [card("pm_other")] },
    ]);
    const { db } = fakeDb({});
    const base = fakeDb({ save: null });
    const r = await importCards(
      "co1",
      TZ,
      [
        { stripe_customer_id: "cus_ok", customer_id: "c-1" },
        { stripe_customer_id: "cus_empty", customer_id: "c-2" },
        { stripe_customer_id: "cus_gone", customer_id: "c-3" },
        // The same customer twice: only the first counts.
        { stripe_customer_id: "cus_other", customer_id: "c-1" },
      ],
      { stripe: f.stripe, db },
    );
    expect(r.imported).toBe(1);
    expect(r.failed).toEqual([
      { stripe_customer_id: "cus_empty", message: "This customer has no saved card in Stripe." },
      { stripe_customer_id: "cus_gone", message: "Couldn’t import this card. Try again." },
    ]);

    // A customer of another shop: the database refuses it (autopay_save_method returns null).
    const other = await importCards(
      "co1",
      TZ,
      [{ stripe_customer_id: "cus_ok", customer_id: "c-x" }],
      {
        stripe: f.stripe,
        db: base.db,
      },
    );
    expect(other.failed).toEqual([
      { stripe_customer_id: "cus_ok", message: "This customer isn’t one of yours." },
    ]);
    expect(base.calls.map((c) => c.fn)).toEqual(["autopay_save_method"]);
  });
});
