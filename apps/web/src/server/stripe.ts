import "server-only";
import { notifyPaid } from "./notify-events";
import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import {
  CARD_FEE_MAX_BPS,
  autopaySettings,
  bpsToPercent,
  cardFeeBps,
  cardFeeCents,
  payOverTimeMethods,
  payOverTimeOn,
  type PayLaterMethod,
} from "@leakbook/core";
import { adminClient } from "./admin";
import { applyBillingEvent, finishOnboarding } from "./billing";
import { recordChargeRefund } from "./refunds";

// Payments (BUILD_PLAN 6.4): Stripe Connect with Standard accounts and direct charges, so
// the shop is the merchant of record. Deposits and invoices are Checkout Sessions on the
// shop's account with card (and the Apple Pay and Google Pay wallets), Link, and US bank
// account (ACH). With a publishable key the session is shown on our own page (embedded
// Checkout); without one the customer goes to Stripe's page. Webhooks update payments and
// accounts; each event applies once.

export class PaymentsNotConfigured extends Error {
  constructor() {
    super("Online payments aren’t set up on this Sundeck Pro server yet.");
  }
}

export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

/** The platform's publishable key: with it, Checkout is shown on our own pages. */
export function stripePublishableKey(): string | null {
  return process.env.STRIPE_PUBLISHABLE_KEY || null;
}
const publishableKey = stripePublishableKey;

/** True when the server can take payments: Stripe key and service key both present. */
export function paymentsConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function deps(stripe?: Stripe | null, db?: SupabaseClient | null) {
  const s = stripe === undefined ? stripeClient() : stripe;
  const d = db === undefined ? adminClient() : db;
  if (!s || !d) throw new PaymentsNotConfigured();
  return { stripe: s, db: d };
}

async function rpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------------------------------------------------------------------------
// Connect onboarding (owners, from settings)
// ---------------------------------------------------------------------------

export interface PaymentAccount {
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

/**
 * Creates the shop's account the first time, then returns a Stripe-hosted onboarding link.
 * `existing` is the shop's saved account, if any.
 *
 * Accounts v2 (owner, 2026-10-18: new Stripe accounts refuse v1 account creation): the shop
 * gets its own full Stripe Dashboard, is the merchant of record for direct charges, and pays
 * Stripe's fees and covers its own losses, as a v1 Standard account did. Everything else
 * stays on v1: Stripe answers v1 calls for a v2 account in v1 form, and still sends v1
 * `account.updated` events for it to the Connected accounts webhook.
 */
export async function onboardingLink(
  company: { id: string; name: string; email?: string | null },
  existing: PaymentAccount | null,
  origin: string,
  stripe?: Stripe | null,
  db?: SupabaseClient | null,
): Promise<string> {
  const d = deps(stripe, db);
  let accountId = existing?.stripe_account_id;
  if (!accountId) {
    const account = await d.stripe.v2.core.accounts.create(
      {
        display_name: company.name,
        contact_email: company.email ?? undefined,
        dashboard: "full",
        identity: { country: "us" },
        configuration: {
          merchant: {
            capabilities: {
              card_payments: { requested: true },
              // Bank (ACH) payments on quotes and invoices.
              ach_debit_payments: { requested: true },
            },
          },
        },
        defaults: {
          currency: "usd",
          locales: ["en-US"],
          responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
        },
        metadata: { company_id: company.id },
      },
      { idempotencyKey: `account-v2-${company.id}` },
    );
    accountId = account.id;
    await rpc(d.db, "stripe_save_account", {
      target_company: company.id,
      account_id: accountId,
      charges: false,
      payouts: false,
      submitted: false,
    });
  }
  await registerPaymentDomain(d.stripe, accountId, origin);
  const link = await d.stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant"],
        refresh_url: `${origin}/settings/payments?stripe=refresh`,
        return_url: `${origin}/settings/payments?stripe=return`,
      },
    },
  });
  return link.url;
}

/**
 * Apple Pay and Google Pay inside embedded Checkout need the site's domain registered on the
 * shop's account. Safe to repeat; skipped for local addresses, and never blocks onboarding.
 */
export async function registerPaymentDomain(
  stripe: Stripe,
  accountId: string,
  origin: string | undefined,
): Promise<void> {
  if (!origin) return;
  const host = new URL(origin).hostname;
  if (host === "localhost" || /^[\d.]+$/.test(host) || host.endsWith(".test")) return;
  try {
    await stripe.paymentMethodDomains.create(
      { domain_name: host },
      { stripeAccount: accountId, idempotencyKey: `domain-${accountId}-${host}` },
    );
  } catch {
    // Already registered, or wallets not available for this account: card still works.
  }
}

/** Reads the account's current state from Stripe and saves it (after onboarding). */
export async function refreshAccount(
  companyId: string,
  accountId: string,
  origin?: string,
  stripe?: Stripe | null,
  db?: SupabaseClient | null,
): Promise<void> {
  const d = deps(stripe, db);
  const account = await d.stripe.accounts.retrieve(accountId);
  if (account.charges_enabled) await registerPaymentDomain(d.stripe, account.id, origin);
  await rpc(d.db, "stripe_save_account", {
    target_company: companyId,
    account_id: account.id,
    charges: account.charges_enabled ?? false,
    payouts: account.payouts_enabled ?? false,
    submitted: account.details_submitted ?? false,
  });
}

// ---------------------------------------------------------------------------
// Checkout (customers, from the quote and invoice pages)
// ---------------------------------------------------------------------------

/** Where the customer pays: Stripe's page, or Checkout embedded on ours. */
export type CheckoutStart =
  | { kind: "page"; url: string }
  | { kind: "embedded"; clientSecret: string; account: string; publishableKey: string };

/**
 * How the customer chose to pay when the shop passes on the card fee: card, bank, or (Pay Over
 * Time) Affirm or Klarna, which carry no fee.
 */
export type PayMethod = "card" | "bank" | "later";

// ---------------------------------------------------------------------------
// Methods a shop's account may not have on: Link, and (Pay Over Time,
// docs/design/2026-11-16-autopay.md) Affirm and Klarna. Sending a method that isn't active makes
// Checkout fail outright (2026-11-24: a shop without Link couldn't take cards at all), so the
// account's capabilities are read first, and kept for ten minutes.
// ---------------------------------------------------------------------------

export interface PayLaterActive {
  affirm: boolean;
  klarna: boolean;
}

interface AccountMethods extends PayLaterActive {
  link: boolean;
}

const LATER_TTL_MS = 10 * 60 * 1000;
const laterCache = new Map<string, { at: number; active: AccountMethods }>();

/** Which optional methods are active on the shop's account. Never throws. */
async function accountMethods(stripe: Stripe, account: string): Promise<AccountMethods> {
  const hit = laterCache.get(account);
  if (hit && Date.now() - hit.at < LATER_TTL_MS) return hit.active;
  try {
    const a = await stripe.accounts.retrieve(account);
    const caps = (a.capabilities ?? {}) as Record<string, string | undefined>;
    const active = {
      affirm: caps.affirm_payments === "active",
      klarna: caps.klarna_payments === "active",
      link: caps.link_payments === "active",
    };
    laterCache.set(account, { at: Date.now(), active });
    return active;
  } catch {
    // Not kept: the next page or payment asks Stripe again. Card and bank still work.
    return { affirm: false, klarna: false, link: false };
  }
}

/** Which of Affirm and Klarna are active on the shop's account. Never throws. */
export async function payLaterActive(stripe: Stripe, account: string): Promise<PayLaterActive> {
  const { affirm, klarna } = await accountMethods(stripe, account);
  return { affirm, klarna };
}

/** Card, with Link beside it only when the shop's account has Link on. */
async function cardMethods(
  stripe: Stripe,
  account: string,
): Promise<Stripe.Checkout.SessionCreateParams.PaymentMethodType[]> {
  return (await accountMethods(stripe, account)).link ? ["card", "link"] : ["card"];
}

/** For tests: forget what Stripe said. */
export function forgetPayLater(): void {
  laterCache.clear();
}

/** Affirm and Klarna for this amount: the shop offers them and Stripe has them on. */
async function payLaterFor(
  stripe: Stripe,
  settings: unknown,
  account: string,
  amountCents: number,
): Promise<PayLaterMethod[]> {
  if (!payOverTimeOn(settings)) return [];
  if (payOverTimeMethods(amountCents, { affirm: true, klarna: true }).length === 0) return [];
  return payOverTimeMethods(amountCents, await payLaterActive(stripe, account));
}

/**
 * What a customer's quote or invoice page offers: Affirm and Klarna for the amount, or none.
 * Never throws; none when payments aren't set up.
 */
export async function payLaterOffer(
  table: "quote" | "invoice",
  id: string,
  amountCents: number,
): Promise<PayLaterMethod[]> {
  const db = adminClient();
  const stripe = stripeClient();
  if (!db || !stripe) return [];
  try {
    const { data } = await db
      .from(table)
      .select(`company_id, company:company!${table}_company_id_fkey(settings)`)
      .eq("id", id)
      .maybeSingle();
    if (!data) return [];
    const { data: account } = await db
      .from("stripe_account")
      .select("stripe_account_id, charges_enabled")
      .eq("company_id", data.company_id)
      .maybeSingle();
    if (!account?.charges_enabled) return [];
    const settings = (data.company as { settings?: unknown } | null)?.settings;
    return await payLaterFor(stripe, settings, account.stripe_account_id as string, amountCents);
  } catch {
    return [];
  }
}

/**
 * Settings › Payments and Deposits: which of Affirm and Klarna the shop's Stripe account has
 * on, or null when it can't take payments yet. Never throws.
 */
export async function payLaterStatusFor(companyId: string): Promise<PayLaterActive | null> {
  const db = adminClient();
  const stripe = stripeClient();
  if (!db || !stripe) return null;
  const { data: account } = await db
    .from("stripe_account")
    .select("stripe_account_id, charges_enabled")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!account?.charges_enabled) return null;
  return payLaterActive(stripe, account.stripe_account_id as string);
}

/**
 * The card fee (owner, 2026-10-19: "Pass on credit card fee to customer"). With the shop's fee
 * on, the customer picks card, bank or Pay Over Time first: card adds the fee as its own line,
 * and the others have none. With it off, one Checkout offers every method, as before, plus
 * Affirm and Klarna when they qualify. Saving for autopay offers card and bank only (Affirm,
 * Klarna and Link can't be charged later).
 */
async function payTerms(
  stripe: Stripe,
  db: SupabaseClient,
  companyId: string,
  account: string,
  amountCents: number,
  method: PayMethod | null,
  save = false,
): Promise<{
  methods: Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
  feeCents: number;
  bps: number;
  settings: unknown;
}> {
  const { data } = await db.from("company").select("settings").eq("id", companyId).single();
  const settings = data?.settings;
  const bps = cardFeeBps(settings);
  if (method === "later") {
    const later = await payLaterFor(stripe, settings, account, amountCents);
    if (later.length === 0)
      throw new CheckoutRefused("Paying over time isn’t available for this amount.");
    return { methods: later, feeCents: 0, bps, settings };
  }
  if (save) {
    if (bps === 0) return { methods: ["card", "us_bank_account"], feeCents: 0, bps, settings };
    if (method === "bank") return { methods: ["us_bank_account"], feeCents: 0, bps, settings };
    if (method === "card")
      return { methods: ["card"], feeCents: cardFeeCents(amountCents, bps), bps, settings };
    throw new CheckoutRefused("Choose card or bank account.");
  }
  if (bps === 0) {
    const later = await payLaterFor(stripe, settings, account, amountCents);
    const card = await cardMethods(stripe, account);
    return { methods: [...card, "us_bank_account", ...later], feeCents: 0, bps, settings };
  }
  if (method === "bank") return { methods: ["us_bank_account"], feeCents: 0, bps, settings };
  if (method === "card")
    return {
      methods: await cardMethods(stripe, account),
      feeCents: cardFeeCents(amountCents, bps),
      bps,
      settings,
    };
  throw new CheckoutRefused("Choose card or bank account.");
}

/**
 * The customer's Stripe Customer on the shop's account, made the first time (saving a card for
 * autopay needs one).
 */
export async function stripeCustomerFor(
  stripe: Stripe,
  db: SupabaseClient,
  account: string,
  customer: { id: string; name: string | null; email: string | null },
  companyId: string,
): Promise<string> {
  const existing = await rpc<string | null>(db, "stripe_customer_for", {
    target_customer: customer.id,
    account,
  });
  if (existing) return existing;
  const made = await stripe.customers.create(
    {
      name: customer.name ?? undefined,
      email: customer.email ?? undefined,
      metadata: { customer_id: customer.id, company_id: companyId },
    },
    { stripeAccount: account, idempotencyKey: `customer-${customer.id}-${account}` },
  );
  await rpc(db, "stripe_save_customer", {
    target_customer: customer.id,
    account,
    stripe_customer: made.id,
  });
  return made.id;
}

/** The shop's card fee for a customer's quote or invoice page (0 when off or unknown). */
export async function cardFeeFor(table: "quote" | "invoice", id: string): Promise<number> {
  const db = adminClient();
  if (!db) return 0;
  const { data } = await db
    .from(table)
    .select(`company:company!${table}_company_id_fkey(settings)`)
    .eq("id", id)
    .maybeSingle();
  return cardFeeBps((data?.company as { settings?: unknown } | null)?.settings);
}

/** The fee line on a card payment's Checkout. */
const feeLine = (feeCents: number, bps: number) => ({
  quantity: 1,
  price_data: {
    currency: "usd",
    unit_amount: feeCents,
    product_data: { name: `Card fee (${bpsToPercent(bps)}%)` },
  },
});

export async function startCheckout(
  stripe: Stripe,
  account: string,
  pagePath: string,
  key: string | null,
  params: Pick<
    Stripe.Checkout.SessionCreateParams,
    | "line_items"
    | "customer_email"
    | "customer"
    | "metadata"
    | "payment_intent_data"
    | "setup_intent_data"
  > & {
    methods?: Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
    /** "setup" saves a card or bank account without paying (Request Card on File). */
    mode?: "payment" | "setup";
    /** What the page is told on the way back: ?paid=1, or ?saved=1 after saving. */
    back?: string;
  },
): Promise<CheckoutStart> {
  const { methods, mode = "payment", back = "paid=1", ...rest } = params;
  const base = {
    mode,
    payment_method_types: methods ?? ["card", "us_bank_account"],
    ...rest,
  };
  if (key) {
    // After paying, Stripe sends the customer back to the same page, as the hosted flow does.
    const session = await stripe.checkout.sessions.create(
      { ...base, ui_mode: "embedded_page", return_url: `${pagePath}?${back}` },
      { stripeAccount: account },
    );
    if (!session.client_secret) throw new Error("Stripe did not return a checkout session.");
    return { kind: "embedded", clientSecret: session.client_secret, account, publishableKey: key };
  }
  const session = await stripe.checkout.sessions.create(
    { ...base, success_url: `${pagePath}?${back}`, cancel_url: pagePath },
    { stripeAccount: account },
  );
  if (!session.url) throw new Error("Stripe did not return a checkout page.");
  return { kind: "page", url: session.url };
}

interface CheckoutDetails {
  quote_id: string;
  company_id: string;
  number: number | null;
  status: string;
  deposit_cents: number;
  company_name: string;
  customer_email: string | null;
  stripe_account_id: string | null;
  charges_enabled: boolean;
  deposit_paid: boolean;
}

export class CheckoutRefused extends Error {}

/** A Checkout Session for an accepted quote's deposit, on the shop's account. */
export async function depositCheckout(
  token: string,
  origin: string,
  stripe?: Stripe | null,
  db?: SupabaseClient | null,
  key: string | null = publishableKey(),
  method: PayMethod | null = null,
): Promise<CheckoutStart> {
  const d = deps(stripe, db);
  const q = await rpc<CheckoutDetails | null>(d.db, "quote_checkout_details", {
    link_token: token,
  });
  if (!q) throw new CheckoutRefused("This link is not valid.");
  if (q.status !== "accepted") throw new CheckoutRefused("Accept the quote first.");
  if (q.deposit_paid) throw new CheckoutRefused("The deposit is already paid or processing.");
  if (q.deposit_cents <= 0) throw new CheckoutRefused("This quote has no deposit to pay.");
  if (!q.stripe_account_id || !q.charges_enabled)
    throw new CheckoutRefused(`${q.company_name} can’t take online payments yet.`);
  const fee = await payTerms(
    d.stripe,
    d.db,
    q.company_id,
    q.stripe_account_id,
    q.deposit_cents,
    method,
  );
  const metadata = {
    kind: "quote_deposit",
    quote_id: q.quote_id,
    company_id: q.company_id,
    ...(fee.feeCents ? { card_fee_cents: String(fee.feeCents) } : {}),
  };
  return startCheckout(d.stripe, q.stripe_account_id, `${origin}/q/${token}`, key, {
    methods: fee.methods,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: q.deposit_cents,
          product_data: {
            name: `Deposit for quote${q.number ? ` #${q.number}` : ""} · ${q.company_name}`,
          },
        },
      },
      ...(fee.feeCents ? [feeLine(fee.feeCents, fee.bps)] : []),
    ],
    customer_email: q.customer_email ?? undefined,
    metadata,
    payment_intent_data: { metadata },
  });
}

// ---------------------------------------------------------------------------
// Invoice checkout (customers, from the invoice page)
// ---------------------------------------------------------------------------

interface InvoiceCheckoutDetails {
  invoice_id: string;
  company_id: string;
  number: number | null;
  status: string;
  balance_cents: number;
  company_name: string;
  customer_email: string | null;
  stripe_account_id: string | null;
  charges_enabled: boolean;
  payment_pending: boolean;
}

/** A Checkout Session for what is still owed on an invoice, on the shop's account. */
export async function invoiceCheckout(
  token: string,
  origin: string,
  stripe?: Stripe | null,
  db?: SupabaseClient | null,
  key: string | null = publishableKey(),
  method: PayMethod | null = null,
  /** Save for Autopay: the card or bank account is kept for the shop to charge later. */
  save = false,
): Promise<CheckoutStart> {
  const d = deps(stripe, db);
  const i = await rpc<InvoiceCheckoutDetails | null>(d.db, "invoice_checkout_details", {
    link_token: token,
  });
  if (!i) throw new CheckoutRefused("This link is not valid.");
  if (i.status === "void") throw new CheckoutRefused("This invoice was canceled.");
  if (i.status === "paid" || i.balance_cents <= 0)
    throw new CheckoutRefused("This invoice is already paid.");
  if (i.status !== "sent" && i.status !== "partially_paid")
    throw new CheckoutRefused("This invoice can’t be paid online.");
  if (i.payment_pending) throw new CheckoutRefused("A payment is already processing.");
  if (!i.stripe_account_id || !i.charges_enabled)
    throw new CheckoutRefused(`${i.company_name} can’t take online payments yet.`);
  const saving = save && method !== "later";
  const fee = await payTerms(
    d.stripe,
    d.db,
    i.company_id,
    i.stripe_account_id,
    i.balance_cents,
    method,
    saving,
  );
  // Save for Autopay: a Stripe Customer on the shop's account pays, and the method is kept for
  // later (the webhook saves its summary and turns autopay on).
  let customer: string | undefined;
  if (saving) {
    if (!autopaySettings(fee.settings).on)
      throw new CheckoutRefused(`${i.company_name} doesn’t offer autopay.`);
    const a = await rpc<{ customer: { id: string; name: string; email: string | null } | null }>(
      d.db,
      "autopay_details",
      { target_invoice: i.invoice_id },
    );
    if (!a?.customer) throw new CheckoutRefused("This invoice has no customer to save a card for.");
    customer = await stripeCustomerFor(
      d.stripe,
      d.db,
      i.stripe_account_id,
      a.customer,
      i.company_id,
    );
  }
  const metadata = {
    kind: "invoice_payment",
    invoice_id: i.invoice_id,
    company_id: i.company_id,
    ...(fee.feeCents ? { card_fee_cents: String(fee.feeCents) } : {}),
    ...(customer ? { save_for_autopay: "1" } : {}),
  };
  return startCheckout(d.stripe, i.stripe_account_id, `${origin}/i/${token}`, key, {
    methods: fee.methods,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: i.balance_cents,
          product_data: {
            name: `Invoice${i.number ? ` #${i.number}` : ""} · ${i.company_name}`,
          },
        },
      },
      ...(fee.feeCents ? [feeLine(fee.feeCents, fee.bps)] : []),
    ],
    ...(customer ? { customer } : { customer_email: i.customer_email ?? undefined }),
    metadata,
    payment_intent_data: customer ? { metadata, setup_future_usage: "off_session" } : { metadata },
  });
}

// ---------------------------------------------------------------------------
// Request Card on File (customers, from /card/<token>): save without paying
// ---------------------------------------------------------------------------

interface CardRequestDetails {
  company_id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  company: { name: string };
  stripe_account_id: string | null;
  charges_enabled: boolean;
}

/**
 * A Checkout Session in setup mode on the shop's account: the customer saves a card or US bank
 * account for autopay and pays nothing now. The webhook saves its summary and turns autopay on.
 */
export async function cardSetupCheckout(
  token: string,
  origin: string,
  stripe?: Stripe | null,
  db?: SupabaseClient | null,
  key: string | null = publishableKey(),
): Promise<CheckoutStart> {
  const d = deps(stripe, db);
  const r = await rpc<CardRequestDetails | null>(d.db, "card_request_details", {
    link_token: token,
  });
  if (!r) throw new CheckoutRefused("This link is no longer valid. Ask for a new one.");
  if (!r.stripe_account_id || !r.charges_enabled)
    throw new CheckoutRefused(`${r.company.name} can’t take online payments yet.`);
  const customer = await stripeCustomerFor(
    d.stripe,
    d.db,
    r.stripe_account_id,
    { id: r.customer_id, name: r.customer_name, email: r.customer_email },
    r.company_id,
  );
  const metadata = {
    kind: "save_payment_method",
    customer_id: r.customer_id,
    company_id: r.company_id,
  };
  return startCheckout(d.stripe, r.stripe_account_id, `${origin}/card/${token}`, key, {
    mode: "setup",
    back: "saved=1",
    methods: ["card", "us_bank_account"],
    customer,
    metadata,
    setup_intent_data: { metadata },
  });
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/** Secrets for the platform endpoint and (optionally) a separate Connect endpoint. */
function webhookSecrets(): string[] {
  return [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(
    (s): s is string => Boolean(s),
  );
}

export class BadSignature extends Error {}

export function verifyEvent(payload: string, signature: string | null, secrets = webhookSecrets()) {
  if (!signature || secrets.length === 0) throw new BadSignature("Missing signature");
  for (const secret of secrets) {
    try {
      return Stripe.webhooks.constructEvent(payload, signature, secret);
    } catch {
      // Try the next secret.
    }
  }
  throw new BadSignature("Signature does not match");
}

export type WebhookOutcome = "applied" | "duplicate" | "ignored";

const sessionStatus = (event: Stripe.Event, s: Stripe.Checkout.Session) => {
  if (event.type === "checkout.session.async_payment_succeeded") return "succeeded";
  if (event.type === "checkout.session.async_payment_failed") return "failed";
  // completed: cards arrive paid; bank payments arrive unpaid and settle days later.
  return s.payment_status === "unpaid" ? "pending" : "succeeded";
};

/** The card fee a Checkout Session carried (its own line), at most 3% of what it paid for. */
function cardFeeOf(s: Stripe.Checkout.Session): number {
  const fee = Number(s.metadata?.card_fee_cents ?? 0);
  if (!Number.isInteger(fee) || fee <= 0) return 0;
  const total = s.amount_total ?? 0;
  const cap = Math.ceil((total * CARD_FEE_MAX_BPS) / (10_000 + CARD_FEE_MAX_BPS));
  return Math.min(fee, cap);
}

/**
 * Applies one verified event. Replays (same event id) change nothing; so do events that
 * arrive out of order, because a payment never goes back to pending.
 */
export async function applyEvent(
  event: Stripe.Event,
  db?: SupabaseClient | null,
  /** Called once when a payment makes an invoice paid in full (the receipt email). */
  onInvoicePaid?: (invoiceId: string) => Promise<unknown>,
  /**
   * Autopay's part of an event (server/autopay.ts): saving a card or bank account, and bank
   * charges settling. True when it applied something.
   */
  extra?: (event: Stripe.Event, db: SupabaseClient) => Promise<boolean>,
): Promise<WebhookOutcome> {
  const d = db === undefined ? adminClient() : db;
  if (!d) throw new PaymentsNotConfigured();
  if (await rpc<boolean>(d, "stripe_event_seen", { event_id: event.id })) return "duplicate";

  let outcome: WebhookOutcome = "ignored";
  // The shop's own Sundeck Pro subscription (M10), on the platform account.
  if (await applyBillingEvent(event, d)) {
    // A new shop’s card is in: its setup is done (also done on the return page).
    const company = (event.data.object as { metadata?: { company_id?: string } }).metadata
      ?.company_id;
    if (event.type === "checkout.session.completed" && company) await finishOnboarding(d, company);
    await rpc(d, "stripe_claim_event", { event_id: event.id, event_type: event.type });
    return "applied";
  }
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const status = sessionStatus(event, s);
      // Bank payments are the ones that settle later; cards are paid at once.
      const method =
        s.payment_status === "unpaid" || event.type !== "checkout.session.completed"
          ? "ach"
          : "card";
      const payment = {
        session_id: s.id,
        intent_id:
          typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
        // The card fee is the shop's to keep, not a payment on the quote or invoice. It is
        // never more than the 3% cap, whatever the session's metadata says.
        amount: (s.amount_total ?? 0) - cardFeeOf(s),
        pay_method: method,
        pay_status: status,
        // The database records the payment only when it was taken on the record's own shop's
        // connected account (security audit, 2026-10-17).
        paid_account: event.account ?? null,
      };
      // The card fee, kept beside the payment for the receipt (owner, 2026-11-24).
      const fee = cardFeeOf(s);
      const saveFee = () =>
        fee > 0
          ? rpc(d, "stripe_record_card_fee", {
              session_id: s.id,
              intent_id: null,
              fee,
              paid_account: payment.paid_account,
            })
          : null;
      if (s.metadata?.kind === "quote_deposit" && s.metadata.quote_id) {
        await rpc(d, "stripe_record_quote_payment", {
          target_quote: s.metadata.quote_id,
          ...payment,
        });
        await saveFee();
        outcome = "applied";
        if (status === "succeeded") await notifyPaid(d, { sessionId: s.id });
      } else if (s.metadata?.kind === "invoice_payment" && s.metadata.invoice_id) {
        const r = await rpc<{ paid_now: boolean }>(d, "stripe_record_invoice_payment", {
          target_invoice: s.metadata.invoice_id,
          ...payment,
        });
        await saveFee();
        if (r.paid_now && onInvoicePaid) await onInvoicePaid(s.metadata.invoice_id);
        outcome = "applied";
        if (status === "succeeded") await notifyPaid(d, { sessionId: s.id });
      }
      break;
    }
    // A refund on a shop's charge, from the Refund button or Stripe's dashboard (owner,
    // 2026-11-24). Only on the payment's own shop's account; others are ignored.
    case "charge.refunded": {
      if (!event.account) break;
      const r = await recordChargeRefund(d, event.data.object as Stripe.Charge, event.account);
      if (r) outcome = "applied";
      break;
    }
    case "account.updated": {
      const a = event.data.object as Stripe.Account;
      await rpc(d, "stripe_save_account", {
        target_company: null,
        account_id: a.id,
        charges: a.charges_enabled ?? false,
        payouts: a.payouts_enabled ?? false,
        submitted: a.details_submitted ?? false,
      });
      outcome = "applied";
      break;
    }
  }
  if (extra && (await extra(event, d))) outcome = "applied";
  await rpc(d, "stripe_claim_event", { event_id: event.id, event_type: event.type });
  return outcome;
}

/**
 * Card payments taken before the receipt showed the card fee (fee_cents null): reads each one's
 * fee from Stripe once and saves it (owner, 2026-11-24). Returns the fees found by payment id;
 * a payment Stripe can't answer for stays unknown and is tried again next time. Never throws.
 */
export async function fillCardFees(
  invoiceId: string,
  deps?: { stripe?: Stripe | null; db?: SupabaseClient | null },
): Promise<Record<string, number>> {
  const found: Record<string, number> = {};
  const stripe = deps?.stripe === undefined ? stripeClient() : deps.stripe;
  const db = deps?.db === undefined ? adminClient() : deps.db;
  if (!stripe || !db) return found;
  try {
    const { data: rows } = await db
      .from("payment")
      .select("id, company_id, stripe_checkout_session_id, stripe_payment_intent_id")
      .eq("invoice_id", invoiceId)
      .eq("method", "card")
      .is("fee_cents", null);
    if (!rows?.length) return found;
    const { data: account } = await db
      .from("stripe_account")
      .select("stripe_account_id")
      .eq("company_id", rows[0]!.company_id)
      .maybeSingle();
    const stripeAccount = account?.stripe_account_id as string | undefined;
    if (!stripeAccount) return found;
    for (const p of rows) {
      try {
        const sessionId = p.stripe_checkout_session_id as string | null;
        const intentId = p.stripe_payment_intent_id as string | null;
        let fee = 0;
        if (sessionId) {
          fee = cardFeeOf(
            await stripe.checkout.sessions.retrieve(sessionId, {}, { stripeAccount }),
          );
        } else if (intentId) {
          const pi = await stripe.paymentIntents.retrieve(intentId, {}, { stripeAccount });
          const n = Number(pi.metadata?.card_fee_cents ?? 0);
          fee = Number.isInteger(n) && n > 0 ? n : 0;
        } else continue;
        const saved = await rpc<number | null>(db, "stripe_record_card_fee", {
          session_id: sessionId,
          intent_id: sessionId ? null : intentId,
          fee,
          paid_account: stripeAccount,
        });
        if (saved !== null) found[p.id as string] = saved;
      } catch {
        // Stripe or the database didn't answer: try again the next time the receipt opens.
      }
    }
  } catch {
    // As above.
  }
  return found;
}
