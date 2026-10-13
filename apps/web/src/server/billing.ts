import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { adminClient } from "./admin";
import { stripeClient } from "./stripe";

// Tidemark billing (M10): the shop's own subscription to Tidemark, through Stripe Billing on
// the platform account (not the shop's Connect account). Checkout starts it; webhooks keep
// public.subscription current; the database makes an unpaid shop read-only.

export class BillingNotConfigured extends Error {
  constructor() {
    super("Subscriptions aren’t set up on this Tidemark server yet.");
  }
}

export function billingConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_BILLING_PRICE_ID &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export interface SubscriptionRow {
  status: "trialing" | "active" | "past_due" | "canceled";
  trial_ends_at: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

/** Stripe Checkout for the subscription. Time left on the free trial carries over. */
export async function subscribeUrl(
  company: { id: string; name: string },
  ownerEmail: string | null,
  origin: string,
  stripe: Stripe | null = stripeClient(),
  db: SupabaseClient | null = adminClient(),
): Promise<string> {
  const price = process.env.STRIPE_BILLING_PRICE_ID;
  if (!stripe || !db || !price) throw new BillingNotConfigured();
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
    line_items: [{ price, quantity: 1 }],
    metadata: { kind: "tidemark_subscription", company_id: company.id },
    subscription_data: {
      metadata: { company_id: company.id },
      ...(keepTrial ? { trial_end: trialEnd } : {}),
    },
    success_url: `${origin}/settings/billing?subscribed=1`,
    cancel_url: `${origin}/settings/billing`,
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

/** Stripe's subscription states, in Tidemark's four. */
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
