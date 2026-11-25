import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { cardFeeNotInDatabase, fillCardFees, saveCardFee } from "../src/server/stripe";

// The card fee on receipts (owner, 2026-11-24), before and after the database keeps it
// (20261022005800_card_fee_on_receipts.sql): receipts read fees from Stripe until then.

const missingColumn = { code: "42703", message: "column payment.fee_cents does not exist" };
const missingFunction = {
  code: "PGRST202",
  message: "Could not find the function public.stripe_record_card_fee",
};

/** A database with two card payments on invoice i1, with or without the card fee migration. */
function fakeDb(migrated: boolean) {
  const saved: Record<string, unknown>[] = [];
  const rows = [
    {
      id: "p1",
      company_id: "c1",
      stripe_checkout_session_id: "cs_1",
      stripe_payment_intent_id: "pi_1",
    },
    {
      id: "p2",
      company_id: "c1",
      stripe_checkout_session_id: null,
      stripe_payment_intent_id: "pi_2",
    },
  ];
  const db = {
    from(table: string) {
      let feeFilter = false;
      const q = {
        select: () => q,
        eq: () => q,
        is(col: string) {
          if (col === "fee_cents") feeFilter = true;
          return q;
        },
        maybeSingle: async () => ({ data: { stripe_account_id: "acct_shop" }, error: null }),
        then(resolve: (r: unknown) => void) {
          if (table !== "payment") return resolve({ data: [], error: null });
          if (feeFilter && !migrated) return resolve({ data: null, error: missingColumn });
          // Migrated: only p1 is from before receipts showed the fee.
          resolve({ data: migrated ? rows.slice(0, 1) : rows, error: null });
        },
      };
      return q;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      if (!migrated) return { data: null, error: missingFunction };
      saved.push({ fn, ...args });
      return { data: args.fee, error: null };
    },
  };
  return { db: db as unknown as SupabaseClient, saved };
}

const stripe = {
  checkout: {
    sessions: {
      retrieve: async () => ({ amount_total: 103, metadata: { card_fee_cents: "3" } }),
    },
  },
  paymentIntents: {
    retrieve: async () => ({ amount: 20_600, metadata: { card_fee_cents: "600" } }),
  },
} as unknown as Stripe;

describe("card fees on receipts", () => {
  it("knows when the database doesn't keep card fees yet", () => {
    expect(cardFeeNotInDatabase(missingColumn)).toBe(true);
    expect(cardFeeNotInDatabase(missingFunction)).toBe(true);
    expect(cardFeeNotInDatabase({ code: "42501", message: "permission denied" })).toBe(false);
    expect(cardFeeNotInDatabase(null)).toBe(false);
  });

  it("before the migration, reads every card payment's fee from Stripe", async () => {
    const { db, saved } = fakeDb(false);
    expect(await fillCardFees("i1", { stripe, db })).toEqual({ p1: 3, p2: 600 });
    expect(saved).toEqual([]);
  });

  it("after it, reads only the unknown ones and saves them", async () => {
    const { db, saved } = fakeDb(true);
    expect(await fillCardFees("i1", { stripe, db })).toEqual({ p1: 3 });
    expect(saved).toEqual([
      {
        fn: "stripe_record_card_fee",
        session_id: "cs_1",
        intent_id: null,
        fee: 3,
        paid_account: "acct_shop",
      },
    ]);
  });

  it("saving a fee before the migration changes nothing and doesn't fail", async () => {
    const { db } = fakeDb(false);
    const args = { session_id: "cs_1", intent_id: null, fee: 3, paid_account: "acct_shop" };
    expect(await saveCardFee(db, args)).toBeNull();
  });

  it("any other database error still fails", async () => {
    const db = {
      rpc: async () => ({ data: null, error: { code: "42501", message: "permission denied" } }),
    } as unknown as SupabaseClient;
    const args = { session_id: "cs_1", intent_id: null, fee: 3, paid_account: "acct_shop" };
    await expect(saveCardFee(db, args)).rejects.toThrow("permission denied");
  });
});
