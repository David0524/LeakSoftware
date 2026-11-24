import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import {
  localDate,
  planCardImport,
  savedMethodExpired,
  type CardHolder,
  type CardImportCustomer,
  type CardImportPlan,
} from "@leakbook/core";
import { adminClient } from "./admin";
import { methodSummary, saveMethod } from "./autopay";
import { Refusal } from "./failures";
import { PaymentsNotConfigured, stripeClient } from "./stripe";

// Import Saved Cards (core card-import.ts): the shop's copied Stripe customers, read from its
// connected account and matched to its Sundeck customers; then each chosen match saved as the
// customer's card on file with autopay on, through the same path Save for Autopay takes.

/** The most copied customers one page reads (Stripe pages 100 at a time). */
export const CARD_IMPORT_MAX = 3000;
/** Stripe calls at once while reading each customer's cards. */
const AT_ONCE = 8;

interface Deps {
  stripe?: Stripe | null;
  db?: SupabaseClient | null;
}

function deps(d: Deps = {}) {
  const stripe = d.stripe === undefined ? stripeClient() : d.stripe;
  const db = d.db === undefined ? adminClient() : d.db;
  if (!stripe || !db) throw new PaymentsNotConfigured();
  return { stripe, db };
}

/** Runs `fn` over `items`, `limit` at a time, keeping their order. */
async function each<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/** The shop's connected account, when it can take payments. */
async function shopAccount(db: SupabaseClient, companyId: string): Promise<string> {
  const { data } = await db
    .from("stripe_account")
    .select("stripe_account_id, charges_enabled")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data?.charges_enabled)
    throw new Refusal("Set up payments first, in Settings › Payments and Deposits.");
  return data.stripe_account_id as string;
}

const idOf = (v: string | { id: string } | null | undefined) =>
  typeof v === "string" ? v : (v?.id ?? null);

/**
 * The card a copied customer brings: their default when it can be charged, else the newest
 * unexpired one, else the newest. Null when they have none.
 */
export async function holderMethod(
  stripe: Stripe,
  account: string,
  c: Stripe.Customer,
  today: string,
): Promise<Stripe.PaymentMethod | null> {
  const list = await stripe.customers.listPaymentMethods(
    c.id,
    { limit: 20 },
    { stripeAccount: account },
  );
  const usable = list.data.filter((pm) => methodSummary(pm));
  if (usable.length === 0) return null;
  const preferred = [idOf(c.invoice_settings?.default_payment_method), idOf(c.default_source)];
  const byDefault = usable.find((pm) => preferred.includes(pm.id));
  const live = (pm: Stripe.PaymentMethod) => !savedMethodExpired(methodSummary(pm)!, today);
  if (byDefault && live(byDefault)) return byDefault;
  return usable.find(live) ?? byDefault ?? usable[0]!;
}

function holder(c: Stripe.Customer, pm: Stripe.PaymentMethod | null): CardHolder {
  const s = pm ? methodSummary(pm) : null;
  return {
    stripe_customer_id: c.id,
    name: c.name ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    method: s && pm ? { ...s, id: pm.id } : null,
  };
}

/** The shop's Sundeck customers, with the Stripe customer behind each one's card on file. */
async function shopCustomers(db: SupabaseClient, companyId: string) {
  const customers: Omit<CardImportCustomer, "method_stripe_customer">[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("customer")
      .select("id, name, company_name, email, phone")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    customers.push(...((data ?? []) as typeof customers));
    if ((data ?? []).length < 1000) break;
  }
  const methods = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("customer_payment_method")
      .select("customer_id, stripe_customer_id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("customer_id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const m of data ?? [])
      methods.set(m.customer_id as string, m.stripe_customer_id as string);
    if ((data ?? []).length < 1000) break;
  }
  return customers.map((c) => ({ ...c, method_stripe_customer: methods.get(c.id) ?? null }));
}

export interface CardImportPreview {
  account: string;
  plan: CardImportPlan;
  /** Everyone a Needs a Match row can be given to. */
  customers: { id: string; name: string; detail: string | null }[];
}

/** What the import would do: the copied customers, matched where we can tell who they are. */
export async function cardImportPreview(
  companyId: string,
  timezone: string,
  d: Deps = {},
): Promise<CardImportPreview> {
  const { stripe, db } = deps(d);
  const account = await shopAccount(db, companyId);
  const today = localDate(new Date(), timezone);
  const copied: Stripe.Customer[] = [];
  for await (const c of stripe.customers.list({ limit: 100 }, { stripeAccount: account })) {
    if (!c.deleted) copied.push(c);
    if (copied.length >= CARD_IMPORT_MAX) break;
  }
  const holders = await each(copied, AT_ONCE, async (c) =>
    holder(c, await holderMethod(stripe, account, c, today)),
  );
  const customers = await shopCustomers(db, companyId);
  return {
    account,
    plan: planCardImport(holders, customers, today),
    customers: customers
      .map((c) => ({
        id: c.id,
        name: c.name || c.company_name || "Unnamed customer",
        detail:
          [c.name ? c.company_name : null, c.email, c.phone].filter(Boolean).join(" · ") || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export interface CardImportPick {
  stripe_customer_id: string;
  customer_id: string;
}

export interface CardImportResult {
  imported: number;
  failed: { stripe_customer_id: string; message: string }[];
}

/**
 * Saves each pick's card as the customer's card on file and turns their autopay on. The card
 * is chosen again here from Stripe, never taken from the browser, and the database only takes
 * it for a customer of the shop that owns the account.
 */
export async function importCards(
  companyId: string,
  timezone: string,
  picks: CardImportPick[],
  d: Deps = {},
): Promise<CardImportResult> {
  const { stripe, db } = deps(d);
  const account = await shopAccount(db, companyId);
  const today = localDate(new Date(), timezone);
  const seen = new Set<string>();
  const unique = picks.filter((p) => {
    // One card per customer, and one customer per card.
    const ok = !seen.has(p.customer_id) && !seen.has(p.stripe_customer_id);
    seen.add(p.customer_id).add(p.stripe_customer_id);
    return ok;
  });
  const done = await each(unique.slice(0, CARD_IMPORT_MAX), 4, async (p) => {
    try {
      const c = await stripe.customers.retrieve(
        p.stripe_customer_id,
        {},
        { stripeAccount: account },
      );
      if (c.deleted) throw new Refusal("This customer was deleted in Stripe.");
      const pm = await holderMethod(stripe, account, c, today);
      if (!pm) throw new Refusal("This customer has no saved card in Stripe.");
      // The database takes the card only for a customer of the shop that owns the account; only
      // then is the Stripe customer kept as theirs (later checkouts reuse it).
      if (!(await saveMethod(stripe, db, account, p.customer_id, c.id, pm)))
        throw new Refusal("This customer isn’t one of yours.");
      const { error } = await db.rpc("stripe_save_customer", {
        target_customer: p.customer_id,
        account,
        stripe_customer: c.id,
      });
      if (error) throw new Error(error.message);
      return null;
    } catch (e) {
      console.error("card import failed", p.stripe_customer_id, e);
      return {
        stripe_customer_id: p.stripe_customer_id,
        message: e instanceof Refusal ? e.message : "Couldn’t import this card. Try again.",
      };
    }
  });
  const failed = done.filter((f): f is CardImportResult["failed"][number] => f !== null);
  return { imported: done.length - failed.length, failed };
}
