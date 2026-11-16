import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import {
  autopayDay,
  autopayNextTry,
  autopaySettings,
  cardFeeBps,
  cardFeeCents,
  cardRequestMessage,
  formatCents,
  friendlyError,
  localDate,
  savedMethodLabel,
  type SavedMethod,
} from "@leakbook/core";
import { adminClient } from "./admin";
import { EmailNotConfigured, emailConfigured, fromAddress, sendEmail } from "./email";
import { Refusal, dbFailure } from "./failures";
import { sendInvoice, sendReceipt, type MailDetails, type SendInvoiceResult } from "./invoices";
import { notifyAutopayFailed, notifyPaidIntent } from "./notify-events";
import { PaymentsNotConfigured, stripeClient } from "./stripe";
import { TextingError, sendCompanyText } from "./texting";
import { emailRefusal } from "./usage";

// Autopay (docs/design/2026-11-16-autopay.md): a customer's saved card or bank account (a
// Stripe PaymentMethod on the shop's connected account), charged off-session for monthly
// maintenance invoices when they're sent, again on the shop's retry schedule when that fails,
// and for any invoice when the office taps Charge Card on File. Charges are direct charges on
// the shop's account, as Checkout payments are; the card fee applies to cards as it does there.

async function rpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw dbFailure(error);
  return data as T;
}

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

export interface AutopayDetails {
  invoice_id: string;
  company_id: string;
  job_id: string;
  number: number | null;
  status: string;
  monthly: boolean;
  balance_cents: number;
  autopay_status: string | null;
  autopay_tries: number;
  payment_pending: boolean;
  company_name: string;
  settings: Record<string, unknown> | null;
  timezone: string;
  stripe_account_id: string | null;
  charges_enabled: boolean;
  customer: { id: string; name: string; email: string | null; autopay: boolean } | null;
  method:
    | (SavedMethod & {
        id: string;
        label: string;
        stripe_account_id: string;
        stripe_customer_id: string;
        stripe_payment_method_id: string;
      })
    | null;
}

/** Why an invoice can't be charged now, or null. Automatic charges also need consent. */
export function chargeRefusal(d: AutopayDetails, automatic: boolean): string | null {
  if (d.status !== "sent" && d.status !== "partially_paid")
    return d.status === "paid" ? "This invoice is already paid." : "Send the invoice first.";
  if (d.balance_cents <= 0) return "Nothing is owed on this invoice.";
  if (d.payment_pending) return "A payment is already processing.";
  if (!d.stripe_account_id || !d.charges_enabled)
    return "Set up online payments in Settings › Payments and Deposits first.";
  if (!d.method) return "No card or bank account is saved for this customer.";
  if (d.method.stripe_account_id !== d.stripe_account_id)
    return "The saved card belongs to a different Stripe account. Request a new one.";
  if (automatic) {
    if (!autopaySettings(d.settings).on) return "Autopay is off for the shop.";
    if (!d.customer?.autopay) return "Autopay is off for this customer.";
  }
  return null;
}

/**
 * The method an automatic charge will use when this invoice is sent, or null: a monthly
 * maintenance invoice, the shop and customer on autopay, a method saved. Used for the invoice
 * email's wording. Never throws.
 */
export async function willAutopay(invoiceId: string, db = adminClient()): Promise<string | null> {
  if (!db || !stripeClient()) return null;
  try {
    const d = await rpc<AutopayDetails | null>(db, "autopay_details", {
      target_invoice: invoiceId,
    });
    if (!d || !d.monthly || d.autopay_tries > 0) return null;
    // As if sent: what's owed is the draft's total.
    const asSent = { ...d, status: "sent", balance_cents: Math.max(d.balance_cents, 1) };
    return chargeRefusal(asSent, true) ? null : (d.method?.label ?? null);
  } catch {
    return null;
  }
}

export type ChargeTrigger = "send" | "retry" | "office";

export interface ChargeResult {
  outcome: "succeeded" | "processing" | "failed" | "skipped";
  message: string;
  paidNow?: boolean;
}

/** A Stripe error that declined the charge (a card error), with its payment intent. */
function declined(e: unknown): { message: string; intent: string | null } | null {
  const err = e as {
    type?: string;
    message?: string;
    raw?: { payment_intent?: { id?: string } };
    payment_intent?: { id?: string };
  };
  if (err?.type !== "StripeCardError") return null;
  return {
    message: err.message?.trim() || "The card was declined.",
    intent: err.payment_intent?.id ?? err.raw?.payment_intent?.id ?? null,
  };
}

/**
 * Charges an invoice's balance to the customer's saved method, off-session, on the shop's
 * account. "send" (a monthly maintenance invoice was just sent) and "retry" (the daily run)
 * need the shop's and customer's autopay; "office" (Charge Card on File) needs a manager, which
 * the caller checked. Never throws for a decline: the result says what happened.
 */
export async function chargeInvoice(
  invoiceId: string,
  opts: { trigger: ChargeTrigger; origin: string; now?: Date } & Deps,
): Promise<ChargeResult> {
  const { stripe, db } = deps(opts);
  const automatic = opts.trigger !== "office";
  const d = await rpc<AutopayDetails | null>(db, "autopay_details", { target_invoice: invoiceId });
  if (!d) throw new Refusal("Invoice not found.");
  if (opts.trigger === "send" && (!d.monthly || d.autopay_tries > 0))
    return { outcome: "skipped", message: "Not charged automatically." };
  const refusal = chargeRefusal(d, automatic);
  if (refusal) {
    if (automatic) return { outcome: "skipped", message: refusal };
    throw new Refusal(refusal);
  }
  const m = d.method!;
  const label = m.label || savedMethodLabel(m);
  const card = m.kind === "card";
  const feeCents = card ? cardFeeCents(d.balance_cents, cardFeeBps(d.settings)) : 0;
  const tries = d.autopay_tries + 1;
  const today = localDate(opts.now ?? new Date(), d.timezone || "America/Phoenix");
  const nextTry = automatic ? autopayNextTry(today, tries, autopaySettings(d.settings)) : null;
  const metadata = {
    kind: "autopay",
    invoice_id: d.invoice_id,
    company_id: d.company_id,
    trigger: opts.trigger,
    ...(feeCents ? { card_fee_cents: String(feeCents) } : {}),
  };

  let intent: Stripe.PaymentIntent | null = null;
  let failure: string | null = null;
  let failedIntent: string | null = null;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: d.balance_cents + feeCents,
        currency: "usd",
        customer: m.stripe_customer_id,
        payment_method: m.stripe_payment_method_id,
        payment_method_types: [card ? "card" : "us_bank_account"],
        off_session: true,
        confirm: true,
        description: `Invoice${d.number ? ` #${d.number}` : ""} · ${d.company_name}`,
        metadata,
      },
      { stripeAccount: d.stripe_account_id!, idempotencyKey: `autopay-${d.invoice_id}-${tries}` },
    );
  } catch (e) {
    const no = declined(e);
    if (!no && !automatic)
      throw new Refusal("Stripe couldn’t take the payment. Try again shortly.");
    failure = no?.message ?? "Stripe couldn’t take the payment.";
    failedIntent = no?.intent ?? null;
  }
  const status = intent?.status;
  const outcome: ChargeResult["outcome"] =
    status === "succeeded" ? "succeeded" : status === "processing" ? "processing" : "failed";
  if (outcome === "failed" && !failure)
    failure =
      status === "requires_action"
        ? "The card needs the customer to confirm the payment."
        : "The payment didn’t go through.";

  const recorded = await rpc<{ paid_now: boolean }>(db, "autopay_record", {
    target_invoice: d.invoice_id,
    outcome,
    intent_id: intent?.id ?? failedIntent,
    amount: d.balance_cents,
    pay_method: card ? "card" : "ach",
    method_label: label,
    failure,
    next_try: nextTry,
    paid_account: d.stripe_account_id,
  });

  if (outcome === "succeeded") {
    if (recorded.paid_now) await sendReceipt(d.invoice_id, opts.origin, db);
    if (intent) await notifyPaidIntent(db, intent.id);
    return {
      outcome,
      paidNow: recorded.paid_now,
      message: `Charged ${formatCents(d.balance_cents + feeCents)} to ${label}.`,
    };
  }
  if (outcome === "processing")
    return {
      outcome,
      message: `Charged ${formatCents(d.balance_cents)} to ${label}. Bank payments take a few business days to clear.`,
    };
  if (automatic) await afterFailure(db, d, label, failure, nextTry, opts.origin);
  return { outcome, message: `${label} wasn’t charged: ${failure}` };
}

/**
 * An automatic charge failed: the first time, the customer gets their pay link by email; the
 * owners and admins hear about it then and when the last try fails. Never throws.
 */
async function afterFailure(
  db: SupabaseClient,
  d: Pick<
    AutopayDetails,
    "invoice_id" | "company_id" | "number" | "balance_cents" | "autopay_tries"
  > & {
    customer: { name: string } | null;
  },
  label: string,
  failure: string | null,
  nextTry: string | null,
  origin: string,
): Promise<void> {
  const first = d.autopay_tries === 0;
  if (first) await emailFailure(db, d.invoice_id, label, nextTry, origin).catch(() => false);
  if (first || !nextTry)
    await notifyAutopayFailed(db, {
      companyId: d.company_id,
      invoiceId: d.invoice_id,
      customer: d.customer?.name ?? null,
      amountCents: d.balance_cents,
      number: d.number,
      reason: failure,
    });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The customer's "we couldn't charge your card" email, with the invoice's pay link. */
async function emailFailure(
  db: SupabaseClient,
  invoiceId: string,
  label: string,
  nextTry: string | null,
  origin: string,
): Promise<boolean> {
  if (!emailConfigured()) return false;
  const d = await rpc<MailDetails>(db, "invoice_mail_details", { target_invoice: invoiceId });
  const to = d.customer?.email?.trim();
  if (!to || !d.token) return false;
  const { data: job } = await db.from("job").select("company_id").eq("id", d.job_id).single();
  if (!job) return false;
  const shop = d.company.name;
  const link = `${origin}/i/${d.token}`;
  const greeting = d.customer?.name ? `Hi ${d.customer.name},` : "Hello,";
  const what = `We couldn’t charge your ${label} for invoice${d.number ? ` #${d.number}` : ""} (${formatCents(d.balance_cents)}).`;
  const again = nextTry
    ? `We’ll try again on ${autopayDay(nextTry)}, or you can pay now with any card or bank account:`
    : "Please pay it here with any card or bank account:";
  const email = await sendEmail({
    companyId: job.company_id as string,
    from: fromAddress(shop),
    to,
    replyTo: d.company.email,
    subject: `Your automatic payment to ${shop} didn’t go through`,
    text: `${greeting}\n\n${what} ${again}\n${link}\n\n${shop}${d.company.phone ? `\n${d.company.phone}` : ""}`,
    html: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(what)} ${escapeHtml(again)}</p><p><a href="${link}">Pay your invoice</a></p><p>${escapeHtml(shop)}${d.company.phone ? `<br>${escapeHtml(d.company.phone)}` : ""}</p>`,
  });
  // The server isn't a member, so the log row is written directly (as sendReceipt does).
  await db.from("message").insert({
    company_id: job.company_id,
    job_id: d.job_id,
    channel: "email",
    recipient: to,
    template: "invoice",
    status: "sent",
    provider_id: email.id,
  });
  return true;
}

/**
 * After an invoice is sent (by hand, Send All, or on its invoice day): a monthly maintenance
 * invoice for a customer on autopay is charged now. Never throws; the send already worked.
 */
export async function autopayAfterSend(invoiceId: string, origin: string): Promise<ChargeResult> {
  try {
    if (!stripeClient() || !adminClient())
      return { outcome: "skipped", message: "Payments aren’t set up." };
    return await chargeInvoice(invoiceId, { trigger: "send", origin });
  } catch (e) {
    return { outcome: "skipped", message: friendlyError(e) };
  }
}

/**
 * sendInvoice, then autopay: a monthly maintenance invoice for a customer on autopay says so
 * in its email and is charged right after it's sent. Every send goes through here (the office,
 * the apps, Send All, and the invoice day). A charge runs even when the email failed, since
 * the invoice was sent; the send's error is then passed on.
 */
export async function sendInvoiceWithAutopay(
  db: SupabaseClient,
  invoiceId: string,
  opts: Parameters<typeof sendInvoice>[2],
): Promise<SendInvoiceResult & { autopay: ChargeResult | null }> {
  const label = await willAutopay(invoiceId);
  let sent: SendInvoiceResult;
  try {
    sent = await sendInvoice(db, invoiceId, { ...opts, autopay: label });
  } catch (e) {
    if (label) await autopayAfterSend(invoiceId, opts.origin);
    throw e;
  }
  return { ...sent, autopay: label ? await autopayAfterSend(invoiceId, opts.origin) : null };
}

/** What the office is told after sending, about the automatic charge. */
export function autopaySentNote(r: ChargeResult | null): string {
  if (!r || r.outcome === "skipped") return "";
  return ` ${r.message}`;
}

/** The daily run: failed automatic charges whose next try is today. */
export async function retryAutopay(
  admin: SupabaseClient,
  origin: string,
  at: Date,
  stripe: Stripe | null = stripeClient(),
): Promise<{ tried: number; paid: number }> {
  if (!stripe) return { tried: 0, paid: 0 };
  const { data, error } = await admin.rpc("autopay_retries_due", { at: at.toISOString() });
  if (error) throw new Error(error.message);
  let paid = 0;
  const due = (data ?? []) as { invoice_id: string }[];
  for (const r of due) {
    try {
      const result = await chargeInvoice(r.invoice_id, {
        trigger: "retry",
        origin,
        now: at,
        stripe,
        db: admin,
      });
      if (result.outcome === "succeeded" || result.outcome === "processing") paid++;
    } catch {
      // Left failed; the office sees it on the invoice.
    }
  }
  return { tried: due.length, paid };
}

// ---------------------------------------------------------------------------
// Webhooks: saving a method, and bank charges settling
// ---------------------------------------------------------------------------

const id = (v: string | { id: string } | null | undefined) =>
  typeof v === "string" ? v : (v?.id ?? null);

/** The summary we keep of a Stripe PaymentMethod (never the card number). */
export function methodSummary(pm: Stripe.PaymentMethod): {
  kind: "card" | "us_bank_account";
  brand: string | null;
  last4: string;
  exp_month: number | null;
  exp_year: number | null;
  bank_name: string | null;
} | null {
  if (pm.type === "card" && pm.card?.last4)
    return {
      kind: "card",
      brand: pm.card.brand ?? null,
      last4: pm.card.last4,
      exp_month: pm.card.exp_month ?? null,
      exp_year: pm.card.exp_year ?? null,
      bank_name: null,
    };
  if (pm.type === "us_bank_account" && pm.us_bank_account?.last4)
    return {
      kind: "us_bank_account",
      brand: null,
      last4: pm.us_bank_account.last4,
      exp_month: null,
      exp_year: null,
      bank_name: pm.us_bank_account.bank_name ?? null,
    };
  return null;
}

async function saveMethod(
  stripe: Stripe,
  db: SupabaseClient,
  account: string,
  customerId: string,
  stripeCustomer: string | null,
  pmRef: string | Stripe.PaymentMethod | null,
): Promise<boolean> {
  if (!pmRef) return false;
  const pm =
    typeof pmRef === "string"
      ? await stripe.paymentMethods.retrieve(pmRef, {}, { stripeAccount: account })
      : pmRef;
  const summary = methodSummary(pm);
  const owner = stripeCustomer ?? id(pm.customer as string | { id: string } | null);
  if (!summary || !owner) return false;
  const r = await rpc<{ replaced: string[] } | null>(db, "autopay_save_method", {
    target_customer: customerId,
    account,
    stripe_customer: owner,
    payment_method: pm.id,
    method_kind: summary.kind,
    card_brand: summary.brand,
    last_four: summary.last4,
    month: summary.exp_month,
    year: summary.exp_year,
    bank: summary.bank_name,
    turn_on: true,
  });
  if (!r) return false;
  for (const old of r.replaced ?? []) {
    // The replaced method leaves Stripe too. Best effort: it's already gone from our side.
    await stripe.paymentMethods.detach(old, {}, { stripeAccount: account }).catch(() => undefined);
  }
  return true;
}

/**
 * Autopay's part of a verified Connect event (passed to applyEvent as `extra`):
 *   * checkout.session.completed in setup mode (Request Card on File), or a payment that chose
 *     Save for Autopay: the method's summary is saved and the customer's autopay turns on;
 *   * payment_intent.succeeded / payment_failed for an autopay charge: a bank payment settles.
 */
export function autopayEvents(origin: string, stripe: Stripe | null = stripeClient()) {
  return async (event: Stripe.Event, db: SupabaseClient): Promise<boolean> => {
    const account = event.account;
    if (!account || !stripe) return false;
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const customerId = s.metadata?.customer_id ?? null;
      if (s.mode === "setup" && s.metadata?.kind === "save_payment_method" && customerId) {
        const setupId = id(s.setup_intent as string | { id: string } | null);
        if (!setupId) return false;
        const si = await stripe.setupIntents.retrieve(setupId, {}, { stripeAccount: account });
        return saveMethod(
          stripe,
          db,
          account,
          customerId,
          id(s.customer as string | { id: string } | null),
          si.payment_method as string | Stripe.PaymentMethod | null,
        );
      }
      if (s.mode === "payment" && s.metadata?.save_for_autopay === "1" && s.metadata.invoice_id) {
        const intentId = id(s.payment_intent as string | { id: string } | null);
        if (!intentId) return false;
        const a = await rpc<{ customer: { id: string } | null } | null>(db, "autopay_details", {
          target_invoice: s.metadata.invoice_id,
        });
        if (!a?.customer) return false;
        const pi = await stripe.paymentIntents.retrieve(intentId, {}, { stripeAccount: account });
        return saveMethod(
          stripe,
          db,
          account,
          a.customer.id,
          id(s.customer as string | { id: string } | null),
          pi.payment_method as string | Stripe.PaymentMethod | null,
        );
      }
      return false;
    }
    if (
      event.type === "payment_intent.succeeded" ||
      event.type === "payment_intent.payment_failed"
    ) {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.kind !== "autopay") return false;
      const failed = event.type === "payment_intent.payment_failed";
      const failure = failed
        ? pi.last_payment_error?.message?.trim() || "The bank payment didn’t go through."
        : null;
      const d = failed
        ? await rpc<AutopayDetails | null>(db, "autopay_details", {
            target_invoice: pi.metadata.invoice_id,
          }).catch(() => null)
        : null;
      const nextTry =
        d && pi.metadata.trigger !== "office"
          ? autopayNextTry(
              localDate(new Date(), d.timezone || "America/Phoenix"),
              d.autopay_tries,
              autopaySettings(d.settings),
            )
          : null;
      const r = await rpc<{ invoice_id: string; paid_now: boolean; changed: boolean } | null>(
        db,
        "autopay_settle",
        {
          intent_id: pi.id,
          pay_status: failed ? "failed" : "succeeded",
          paid_account: account,
          failure,
          next_try: nextTry,
        },
      );
      if (!r?.changed) return Boolean(r);
      if (!failed) {
        if (r.paid_now) await sendReceipt(r.invoice_id, origin, db);
        await notifyPaidIntent(db, pi.id);
      } else if (d && pi.metadata.trigger !== "office") {
        await afterFailure(
          db,
          { ...d, autopay_tries: d.autopay_tries - 1 },
          d.method?.label ?? "saved bank account",
          failure,
          nextTry,
          origin,
        );
      }
      return true;
    }
    return false;
  };
}

// ---------------------------------------------------------------------------
// The office: Turn Off, Turn On, Remove Card, Request Card on File, Charge Card on File
// ---------------------------------------------------------------------------

export type AutopayAction = "turn_off" | "turn_on" | "remove" | "request";
export type RequestChannel = "email" | "text" | "link";

export interface AutopayActionResult {
  message: string;
  /** Request Card on File: the customer's link and the words to share it with. */
  link?: string;
  text?: string;
}

/**
 * One of the Autopay group's actions, as the signed-in manager (`user`; the database checks).
 * Remove Card also detaches the method in Stripe. Request Card on File sends the link by email
 * or a text from the shop's number, or ("link") returns it to share from the phone.
 */
export async function customerAutopayAction(
  user: SupabaseClient,
  userId: string,
  customerId: string,
  action: AutopayAction,
  opts: { channel?: RequestChannel; origin: string; stripe?: Stripe | null },
): Promise<AutopayActionResult> {
  if (action === "turn_off" || action === "turn_on") {
    await rpc(user, "set_customer_autopay", {
      target_customer: customerId,
      turn_on: action === "turn_on",
    });
    return { message: action === "turn_on" ? "Autopay is on." : "Autopay is off." };
  }
  if (action === "remove") {
    const r = await rpc<{ stripe_account_id: string; stripe_payment_method_id: string } | null>(
      user,
      "remove_payment_method",
      { target_customer: customerId },
    );
    const stripe = opts.stripe === undefined ? stripeClient() : opts.stripe;
    if (r && stripe)
      await stripe.paymentMethods
        .detach(r.stripe_payment_method_id, {}, { stripeAccount: r.stripe_account_id })
        .catch(() => undefined);
    return { message: "The saved card is removed and autopay is off." };
  }
  const req = await rpc<{
    token: string;
    name: string;
    email: string | null;
    phone: string | null;
    company_name: string;
  }>(user, "card_request_link", { target_customer: customerId });
  const link = `${opts.origin}/card/${req.token}`;
  const text = cardRequestMessage(req.company_name, link);
  const channel = opts.channel ?? "link";
  if (channel === "link") return { message: "Link ready to share.", link, text };
  if (channel === "text") {
    try {
      await sendCompanyText(user, userId, { customerId, body: text }, opts.origin);
    } catch (e) {
      if (e instanceof TextingError) throw new Refusal(e.message);
      throw e;
    }
    return { message: `Texted ${req.name} the link.`, link, text };
  }
  const to = req.email?.trim();
  if (!to) throw new Refusal("This customer has no email. Text the link instead.");
  if (!emailConfigured()) throw new EmailNotConfigured();
  const { data: c } = await user
    .from("customer")
    .select("company_id")
    .eq("id", customerId)
    .single();
  const companyId = c?.company_id as string;
  const refusal = await emailRefusal(user, companyId, 1);
  if (refusal) throw new Refusal(refusal);
  const shop = req.company_name;
  const greeting = req.name ? `Hi ${req.name},` : "Hello,";
  await sendEmail({
    companyId,
    from: fromAddress(shop),
    to,
    subject: `Save a card for automatic payments to ${shop}`,
    text: `${greeting}\n\n${shop} asks you to save a card or bank account for automatic payments. Your invoices are then paid the day they’re sent, and you get a receipt each time. It’s secure, through Stripe, and you can ask ${shop} to stop any time.\n\n${link}\n\n${shop}`,
    html: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(shop)} asks you to save a card or bank account for automatic payments. Your invoices are then paid the day they’re sent, and you get a receipt each time. It’s secure, through Stripe, and you can ask ${escapeHtml(shop)} to stop any time.</p><p><a href="${link}">Save a card or bank account</a></p><p>${escapeHtml(shop)}</p>`,
  });
  return { message: `Emailed ${req.name} the link.`, link, text };
}

/**
 * Charge Card on File (owners and admins): `user` proves the person may (autopay_details
 * refuses anyone else), then the server charges as the shop.
 */
export async function chargeCardOnFile(
  user: SupabaseClient,
  invoiceId: string,
  origin: string,
  d: Deps = {},
): Promise<ChargeResult> {
  await rpc(user, "autopay_details", { target_invoice: invoiceId });
  return chargeInvoice(invoiceId, { trigger: "office", origin, ...d });
}
