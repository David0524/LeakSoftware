import "server-only";
import { notifyPaid } from "./notify-events";
import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { CARD_FEE_MAX_BPS, bpsToPercent, cardFeeBps, cardFeeCents } from "@leakbook/core";
import { adminClient } from "./admin";
import { applyBillingEvent, finishOnboarding } from "./billing";

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
function publishableKey(): string | null {
  return process.env.STRIPE_PUBLISHABLE_KEY || null;
}

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

const PAYMENT_METHODS = ["card", "link", "us_bank_account"] as const;

/** How the customer chose to pay when the shop passes on the card fee. */
export type PayMethod = "card" | "bank";

/**
 * The card fee (owner, 2026-10-19: "Pass on credit card fee to customer"). With the shop's fee
 * on, the customer picks card or bank first: card adds the fee as its own line, and bank has
 * none. With it off, one Checkout offers every method, as before.
 */
async function feeTerms(
  db: SupabaseClient,
  companyId: string,
  amountCents: number,
  method: PayMethod | null,
): Promise<{
  methods: Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
  feeCents: number;
  bps: number;
}> {
  const { data } = await db.from("company").select("settings").eq("id", companyId).single();
  const bps = cardFeeBps(data?.settings);
  if (bps === 0) return { methods: [...PAYMENT_METHODS], feeCents: 0, bps };
  if (method === "bank") return { methods: ["us_bank_account"], feeCents: 0, bps };
  if (method === "card")
    return { methods: ["card", "link"], feeCents: cardFeeCents(amountCents, bps), bps };
  throw new CheckoutRefused("Choose card or bank account.");
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

async function startCheckout(
  stripe: Stripe,
  account: string,
  pagePath: string,
  key: string | null,
  params: Pick<
    Stripe.Checkout.SessionCreateParams,
    "line_items" | "customer_email" | "metadata" | "payment_intent_data"
  > & { methods?: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] },
): Promise<CheckoutStart> {
  const { methods, ...rest } = params;
  const base = {
    mode: "payment" as const,
    payment_method_types: methods ?? [...PAYMENT_METHODS],
    ...rest,
  };
  if (key) {
    // After paying, Stripe sends the customer back to the same page, as the hosted flow does.
    const session = await stripe.checkout.sessions.create(
      { ...base, ui_mode: "embedded_page", return_url: `${pagePath}?paid=1` },
      { stripeAccount: account },
    );
    if (!session.client_secret) throw new Error("Stripe did not return a checkout session.");
    return { kind: "embedded", clientSecret: session.client_secret, account, publishableKey: key };
  }
  const session = await stripe.checkout.sessions.create(
    { ...base, success_url: `${pagePath}?paid=1`, cancel_url: pagePath },
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
  const fee = await feeTerms(d.db, q.company_id, q.deposit_cents, method);
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
  const fee = await feeTerms(d.db, i.company_id, i.balance_cents, method);
  const metadata = {
    kind: "invoice_payment",
    invoice_id: i.invoice_id,
    company_id: i.company_id,
    ...(fee.feeCents ? { card_fee_cents: String(fee.feeCents) } : {}),
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
    customer_email: i.customer_email ?? undefined,
    metadata,
    payment_intent_data: { metadata },
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
): Promise<WebhookOutcome> {
  const d = db === undefined ? adminClient() : db;
  if (!d) throw new PaymentsNotConfigured();
  if (await rpc<boolean>(d, "stripe_event_seen", { event_id: event.id })) return "duplicate";

  let outcome: WebhookOutcome = "ignored";
  // The shop's own Sundeck Pro subscription (M10), on the platform account.
  if (await applyBillingEvent(event, d)) {
    // A new shop's card is in: its onboarding choices apply (also done on the return page).
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
      if (s.metadata?.kind === "quote_deposit" && s.metadata.quote_id) {
        await rpc(d, "stripe_record_quote_payment", {
          target_quote: s.metadata.quote_id,
          ...payment,
        });
        outcome = "applied";
        if (status === "succeeded") await notifyPaid(d, { sessionId: s.id });
      } else if (s.metadata?.kind === "invoice_payment" && s.metadata.invoice_id) {
        const r = await rpc<{ paid_now: boolean }>(d, "stripe_record_invoice_payment", {
          target_invoice: s.metadata.invoice_id,
          ...payment,
        });
        if (r.paid_now && onInvoicePaid) await onInvoicePaid(s.metadata.invoice_id);
        outcome = "applied";
        if (status === "succeeded") await notifyPaid(d, { sessionId: s.id });
      }
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
  await rpc(d, "stripe_claim_event", { event_id: event.id, event_type: event.type });
  return outcome;
}
