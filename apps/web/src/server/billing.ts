import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import {
  companyServices,
  parseOnboardingAnswers,
  PLANS,
  planForServices,
  servicesPriceCents,
  type Services,
} from "@leakbook/core";
import { adminClient } from "./admin";
import { stripeClient } from "./stripe";

// Sundeck Pro billing (M10): the shop's own subscription to Sundeck Pro, through Stripe Billing on
// the platform account (not the shop's Connect account). Checkout starts it; webhooks keep
// public.subscription current; the database makes an unpaid shop read-only. The price is the
// shop's package and number of people (packages/core/src/plans.ts), so there is no price id:
// Checkout and later changes send the amount (owner, 2026-10-16).

export class BillingNotConfigured extends Error {
  constructor() {
    super("Subscriptions aren’t set up on this Sundeck Pro server yet.");
  }
}

/** Onboarding keeps its answers with the server key; without it, new shops skip it. */
export function onboardingAvailable(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export interface SubscriptionRow {
  status: "trialing" | "active" | "past_due" | "canceled";
  trial_ends_at: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

/** Who is billed: the active members (turned-off teammates and pending invites don't count). */
async function billedPeople(db: SupabaseClient, companyId: string): Promise<number> {
  const { count, error } = await db
    .from("membership")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "active");
  if (error) throw new Error(error.message);
  return Math.max(1, count ?? 1);
}

/** The shop's monthly price and the plan's name for the invoice line. */
async function shopPrice(
  db: SupabaseClient,
  companyId: string,
): Promise<{ services: Services; people: number; cents: number; name: string }> {
  const { data, error } = await db.from("company").select("settings").eq("id", companyId).single();
  if (error) throw new Error(error.message);
  const services = companyServices(data.settings);
  const people = await billedPeople(db, companyId);
  const name =
    services === "both"
      ? `Sundeck Pro ${PLANS.maintenance.name} + ${PLANS.leak.name}`
      : `Sundeck Pro ${planForServices(services).name}`;
  return { services, people, cents: servicesPriceCents(services, people), name };
}

const monthly = { interval: "month" } as const;

/**
 * The Stripe product a package is billed under: one per package name, made the first time it's
 * needed and kept active. A product made inline at Checkout (`product_data`) is inactive, and
 * Stripe then refuses to change the subscription's price (found in the sandbox, 2026-10-18).
 */
export async function packageProduct(stripe: Stripe, name: string): Promise<string> {
  const id = `sundeckpro_${name
    .toLowerCase()
    .replace(/^sundeck pro /, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")}`;
  try {
    const product = await stripe.products.retrieve(id);
    if (!product.active || product.name !== name)
      await stripe.products.update(id, { active: true, name });
    return id;
  } catch (error) {
    if ((error as { code?: string }).code !== "resource_missing") throw error;
  }
  try {
    await stripe.products.create({ id, name });
  } catch (error) {
    // Another request made it first.
    if ((error as { code?: string }).code !== "resource_already_exists") throw error;
  }
  return id;
}

/**
 * Stripe Checkout for the subscription, priced for the shop's package and people. Time left
 * on the free trial carries over. New shops come here from onboarding and go back to it.
 */
export async function subscribeUrl(
  company: { id: string; name: string },
  ownerEmail: string | null,
  origin: string,
  stripe: Stripe | null = stripeClient(),
  db: SupabaseClient | null = adminClient(),
  from: "billing" | "welcome" = "billing",
): Promise<string> {
  if (!stripe || !db) throw new BillingNotConfigured();
  const price = await shopPrice(db, company.id);
  const { data: sub } = await db
    .from("subscription")
    .select("trial_ends_at, stripe_customer_id")
    .eq("company_id", company.id)
    .maybeSingle();
  let customer = sub?.stripe_customer_id as string | null | undefined;
  if (!customer) {
    const created = await stripe.customers.create({
      name: company.name,
      email: ownerEmail ?? undefined,
      metadata: { company_id: company.id },
    });
    customer = created.id;
    await db
      .from("subscription")
      .update({ stripe_customer_id: customer })
      .eq("company_id", company.id);
  }
  // Stripe needs a trial end at least two days out; less than that, billing starts now.
  const trialEnd = sub?.trial_ends_at ? Math.floor(Date.parse(sub.trial_ends_at) / 1000) : 0;
  const keepTrial = trialEnd > Date.now() / 1000 + 2 * 86_400;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: company.id,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product: await packageProduct(stripe, price.name),
          unit_amount: price.cents,
          recurring: monthly,
        },
        quantity: 1,
      },
    ],
    metadata: { kind: "tidemark_subscription", company_id: company.id },
    subscription_data: {
      metadata: { company_id: company.id },
      ...(keepTrial ? { trial_end: trialEnd } : {}),
    },
    success_url:
      from === "welcome"
        ? `${origin}/welcome/done?session_id={CHECKOUT_SESSION_ID}`
        : `${origin}/settings/billing?subscribed=1`,
    cancel_url: from === "welcome" ? `${origin}/welcome?step=card` : `${origin}/settings/billing`,
  });
  if (!session.url) throw new Error("Stripe didn’t return a checkout link.");
  return session.url;
}

/** Stripe's billing portal: change the card, see receipts, cancel. */
export async function portalUrl(
  customerId: string,
  origin: string,
  stripe: Stripe | null = stripeClient(),
): Promise<string> {
  if (!stripe) throw new BillingNotConfigured();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/settings/billing`,
  });
  return session.url;
}

/** Stripe's subscription states, in Sundeck Pro's four. */
export function subscriptionStatus(status: Stripe.Subscription.Status): SubscriptionRow["status"] {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    default:
      return "canceled";
  }
}

const iso = (seconds: number | null | undefined) =>
  seconds ? new Date(seconds * 1000).toISOString() : null;

/**
 * Applies a billing event, if it is one: the subscription Checkout finishing, or the
 * subscription changing. Returns false for anything else.
 */
export async function applyBillingEvent(event: Stripe.Event, db: SupabaseClient): Promise<boolean> {
  // Sundeck Pro subscriptions live on the platform account. An event from a shop's connected
  // account carries metadata that shop wrote, so it never changes anyone's subscription
  // (security audit, 2026-10-17).
  if (event.account) return false;
  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.metadata?.kind !== "tidemark_subscription" || !s.metadata.company_id) return false;
    const id = (v: string | { id: string } | null) => (typeof v === "string" ? v : (v?.id ?? null));
    const { error } = await db
      .from("subscription")
      .update({
        stripe_customer_id: id(s.customer as string | { id: string } | null),
        stripe_subscription_id: id(s.subscription as string | { id: string } | null),
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", s.metadata.company_id);
    if (error) throw new Error(error.message);
    return true;
  }
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const companyId = sub.metadata?.company_id;
    const periodEnd = sub.items?.data?.[0]?.current_period_end;
    const values = {
      status:
        event.type === "customer.subscription.deleted"
          ? "canceled"
          : subscriptionStatus(sub.status),
      stripe_subscription_id: sub.id,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      current_period_end: iso(periodEnd),
      ...(sub.trial_end ? { trial_ends_at: iso(sub.trial_end) } : {}),
      updated_at: new Date().toISOString(),
    };
    const query = db.from("subscription").update(values);
    const { error } = await (companyId
      ? query.eq("company_id", companyId)
      : query.eq("stripe_subscription_id", sub.id));
    if (error) throw new Error(error.message);
    return true;
  }
  return false;
}

/**
 * Keeps the subscription's monthly amount equal to the shop's package and people. Run after
 * the team or the package changes, and daily. Prorated on the next invoice. Returns the new
 * amount when it changed, else null.
 */
export async function syncSubscriptionPrice(
  companyId: string,
  stripe: Stripe | null = stripeClient(),
  db: SupabaseClient | null = adminClient(),
): Promise<number | null> {
  if (!stripe || !db) return null;
  const { data: sub } = await db
    .from("subscription")
    .select("stripe_subscription_id, plan, status")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!sub?.stripe_subscription_id || sub.plan === "demo" || sub.status === "canceled") return null;
  const price = await shopPrice(db, companyId);
  const live = await stripe.subscriptions.retrieve(sub.stripe_subscription_id as string);
  const item = live.items.data[0];
  if (!item || item.price.unit_amount === price.cents) return null;
  // The package's own active product: shops subscribed before it existed were billed under an
  // inactive one made at Checkout, which Stripe won't take a new price for.
  const product = await packageProduct(stripe, price.name);
  await stripe.subscriptions.update(live.id, {
    items: [
      {
        id: item.id,
        price_data: { currency: "usd", product, unit_amount: price.cents, recurring: monthly },
      },
    ],
    proration_behavior: "create_prorations",
  });
  return price.cents;
}

/** A price update Stripe refused: logged (Vercel's logs), never shown to customers. */
export function logPriceSyncError(error: unknown): null {
  console.error("[billing] couldn't update the subscription price in Stripe:", error);
  return null;
}

/**
 * For Settings › Sundeck Pro Billing: what the shop pays now (its package and active people),
 * after bringing Stripe in line (owner, 2026-10-18: "Ensure that adding users effects the
 * pricing"). With a sandbox key, Stripe's own message comes back when it refuses, to help
 * setup; with live keys only that it failed.
 */
export async function currentPrice(companyId: string): Promise<{
  name: string;
  people: number;
  cents: number;
  problem: string | null;
} | null> {
  const db = adminClient();
  if (!db) return null;
  const price = await shopPrice(db, companyId);
  let problem: string | null = null;
  try {
    await syncSubscriptionPrice(companyId, stripeClient(), db);
  } catch (error) {
    logPriceSyncError(error);
    problem = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
      ? `Stripe said: ${error instanceof Error ? error.message : String(error)}`
      : "The new price couldn’t be sent to Stripe. It’s tried again every day.";
  }
  return { name: price.name, people: price.people, cents: price.cents, problem };
}

/** `syncSubscriptionPrice` for every subscribed shop (the daily cron). */
export async function syncAllSubscriptionPrices(db: SupabaseClient): Promise<number> {
  const { data } = await db
    .from("subscription")
    .select("company_id")
    .not("stripe_subscription_id", "is", null)
    .neq("status", "canceled");
  let changed = 0;
  for (const row of data ?? []) {
    try {
      if ((await syncSubscriptionPrice(row.company_id as string, undefined, db)) !== null)
        changed++;
    } catch (error) {
      // One shop's Stripe error doesn't stop the rest; tomorrow's run tries again.
      logPriceSyncError(error);
    }
  }
  return changed;
}

/**
 * Applies the owner's onboarding choices (report color; leak detection's deposit) and marks
 * onboarding done. Runs once the card is in (Checkout), since the shop is read-only before
 * that; with no billing on the server it runs at the end of onboarding. Safe to repeat.
 */
export async function finishOnboarding(db: SupabaseClient, companyId: string): Promise<void> {
  const { data: sub, error } = await db
    .from("subscription")
    .select("onboarding, onboarded_at")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!sub || sub.onboarded_at) return;
  const answers = parseOnboardingAnswers(sub.onboarding);
  if (answers) {
    const { data: company } = await db
      .from("company")
      .select("settings")
      .eq("id", companyId)
      .single();
    const settings = { ...((company?.settings ?? {}) as Record<string, unknown>) };
    if (answers.depositBps !== undefined) {
      const deposit = (settings.deposit ?? {}) as Record<string, unknown>;
      settings.deposit = { ...deposit, type: "percent", value_bps: answers.depositBps };
    }
    const { error: saved } = await db
      .from("company")
      .update({ brand_primary: answers.color, settings })
      .eq("id", companyId);
    if (saved) throw new Error(saved.message);
  }
  await db
    .from("subscription")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("company_id", companyId);
}

/**
 * The return page from onboarding's Checkout: links the subscription and applies the
 * onboarding at once, without waiting for the webhook (which does the same). Only for the
 * signed-in owner's own shop and a finished session.
 */
export async function confirmCheckout(
  sessionId: string,
  companyId: string,
  stripe: Stripe | null = stripeClient(),
  db: SupabaseClient | null = adminClient(),
): Promise<boolean> {
  if (!stripe || !db) return false;
  const s = await stripe.checkout.sessions.retrieve(sessionId);
  if (
    s.metadata?.kind !== "tidemark_subscription" ||
    s.metadata.company_id !== companyId ||
    s.status !== "complete"
  )
    return false;
  await applyBillingEvent(
    {
      id: `return_${s.id}`,
      type: "checkout.session.completed",
      data: { object: s },
    } as unknown as Stripe.Event,
    db,
  );
  await finishOnboarding(db, companyId);
  return true;
}
