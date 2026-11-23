import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import {
  billedTeamSize,
  checkoutTrialEnd,
  chosenTeamSize,
  couponId,
  couponMonths,
  offerFromRow,
  percentText,
  type CodeOffer,
  companyServices,
  parseTeamSize,
  PLANS,
  planForServices,
  servicesPriceCents,
  TEAM_SIZE_MAX,
  type Services,
} from "@leakbook/core";
import { adminClient } from "./admin";
import { stripeClient, stripePublishableKey } from "./stripe";

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

/** The trial page marks a new shop set up with the server key; without it, new shops skip it. */
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

/** The active members (turned-off teammates and pending invites don't count). */
export async function activePeople(db: SupabaseClient, companyId: string): Promise<number> {
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
): Promise<{
  services: Services;
  people: number;
  active: number;
  cents: number;
  name: string;
}> {
  const { data, error } = await db.from("company").select("settings").eq("id", companyId).single();
  if (error) throw new Error(error.message);
  const services = companyServices(data.settings);
  // The team size the owner picked, or more when more people are active (owner, 2026-11-12).
  const active = await activePeople(db, companyId);
  const people = billedTeamSize(active, chosenTeamSize(data.settings));
  const name =
    services === "both"
      ? `Sundeck Pro ${PLANS.maintenance.name} + ${PLANS.leak.name}`
      : `Sundeck Pro ${planForServices(services).name}`;
  return { services, people, active, cents: servicesPriceCents(services, people), name };
}

/**
 * Saves the team size the owner picked (owner, 2026-11-12: "you can't adjust how many employees
 * you have and the pricing"). With the server key, since a shop without its card is read-only.
 */
export async function saveTeamSize(
  db: SupabaseClient,
  companyId: string,
  teamSize: number,
): Promise<void> {
  const { data, error } = await db.from("company").select("settings").eq("id", companyId).single();
  if (error) throw new Error(error.message);
  const settings = { ...((data.settings as Record<string, unknown> | null) ?? {}) };
  if (settings.team_size === teamSize) return;
  settings.team_size = teamSize;
  const { error: saveError } = await db.from("company").update({ settings }).eq("id", companyId);
  if (saveError) throw new Error(saveError.message);
}

/**
 * Checks and saves a team size the owner picked: an error to show when it's out of range
 * (fewer than the active people, or past the most), else null.
 */
export async function pickTeamSize(
  companyId: string,
  picked: unknown,
  db: SupabaseClient | null = adminClient(),
): Promise<string | null> {
  if (!db) throw new BillingNotConfigured();
  const active = await activePeople(db, companyId);
  const n = parseTeamSize(picked, active);
  if (n === null)
    return active >= TEAM_SIZE_MAX
      ? `Your team has ${active} people; choose ${active}.`
      : `Choose ${active} to ${TEAM_SIZE_MAX} people.`;
  await saveTeamSize(db, companyId, n);
  return null;
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

/** Where the owner adds the card: Checkout embedded on our page, or Stripe's own page. */
export type SubscribeStart =
  { kind: "embedded"; clientSecret: string } | { kind: "page"; url: string };

/**
 * Stripe Checkout for the subscription, priced for the shop's package and people. Time left
 * on the free trial carries over. New shops come here from the trial page and go back to it.
 * With the publishable key set, the form is embedded on the page (owner, 2026-10-24); without
 * it, the owner goes to Stripe's page.
 */
export async function subscribeCheckout(
  company: { id: string; name: string },
  ownerEmail: string | null,
  origin: string,
  stripe: Stripe | null = stripeClient(),
  db: SupabaseClient | null = adminClient(),
  from: "billing" | "welcome" = "billing",
  embedded: boolean = Boolean(stripePublishableKey()),
): Promise<SubscribeStart> {
  if (!stripe || !db) throw new BillingNotConfigured();
  const price = await shopPrice(db, company.id);
  const { data: sub } = await db
    .from("subscription")
    .select("trial_ends_at, stripe_customer_id, promo_percent_off, promo_percent_months")
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
  // Whole days left, ending at the close of the last one in the shop's time zone, so Checkout
  // reads "30 days free" right after sign-up; two days or less left, billing starts now
  // (checkoutTrialEnd). The webhook copies Stripe's trial end back into trial_ends_at.
  const { data: zone } = await db
    .from("company")
    .select("timezone")
    .eq("id", company.id)
    .maybeSingle();
  const trialEnd = checkoutTrialEnd(
    (sub?.trial_ends_at as string | null | undefined) ?? null,
    new Date(),
    (zone?.timezone as string | undefined) ?? "America/New_York",
  );
  // A promo code's percent off (owner, 2026-11-23): a coupon on the subscription, lasting the
  // trial's whole months plus the paid months promised.
  const percentOff = (sub?.promo_percent_off as number | null | undefined) ?? null;
  const coupon = percentOff
    ? await promoCoupon(
        stripe,
        percentOff,
        (sub?.promo_percent_months as number | null | undefined) ?? null,
        trialEnd ? new Date(trialEnd * 1000) : null,
      )
    : null;
  const done =
    from === "welcome"
      ? `${origin}/welcome/done?session_id={CHECKOUT_SESSION_ID}`
      : `${origin}/settings/billing?subscribed=1`;
  const session = await stripe.checkout.sessions.create({
    ...(embedded
      ? { ui_mode: "embedded_page" as const, return_url: done }
      : {
          success_url: done,
          cancel_url: from === "welcome" ? `${origin}/welcome` : `${origin}/settings/billing`,
        }),
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
    ...(coupon ? { discounts: [{ coupon }] } : {}),
    subscription_data: {
      metadata: { company_id: company.id },
      ...(trialEnd ? { trial_end: trialEnd } : {}),
    },
  });
  if (embedded) {
    if (!session.client_secret) throw new Error("Stripe didn’t return a checkout session.");
    return { kind: "embedded", clientSecret: session.client_secret };
  }
  if (!session.url) throw new Error("Stripe didn’t return a checkout link.");
  return { kind: "page", url: session.url };
}

/**
 * The Stripe coupon for a promo code's percent off, made the first time it's needed under a
 * fixed id and reused (core couponId). A repeating coupon counts its months from Checkout, so
 * it lasts the trial's whole months plus the paid months (core couponMonths).
 */
export async function promoCoupon(
  stripe: Stripe,
  percentOff: number,
  paidMonths: number | null,
  trialEnd: Date | null,
  now: Date = new Date(),
): Promise<string> {
  const duration = paidMonths ? couponMonths(paidMonths, now, trialEnd) : null;
  const id = couponId(percentOff, duration);
  try {
    await stripe.coupons.retrieve(id);
    return id;
  } catch (error) {
    if ((error as { code?: string }).code !== "resource_missing") throw error;
  }
  try {
    await stripe.coupons.create({
      id,
      name: `Sundeck Pro ${percentText(percentOff, paidMonths)}`,
      percent_off: percentOff,
      ...(duration
        ? { duration: "repeating" as const, duration_in_months: duration }
        : { duration: "forever" as const }),
    });
  } catch (error) {
    // Another request made it first.
    if ((error as { code?: string }).code !== "resource_already_exists") throw error;
  }
  return id;
}

/**
 * The promo or referral code the shop used, with its offer (owner, 2026-11-23), and whether it
 * can still enter one (not subscribed, not a demo shop, no code yet). With the server key, so
 * the referring shop's name can be shown.
 */
export async function appliedCode(
  companyId: string,
  db: SupabaseClient | null = adminClient(),
): Promise<{ offer: CodeOffer | null; canEnter: boolean }> {
  if (!db) return { offer: null, canEnter: false };
  const { data, error } = await db
    .from("subscription")
    .select(
      "plan, status, stripe_subscription_id, promo_code, promo_kind, promo_free_months, promo_percent_off, promo_percent_months, referred_by",
    )
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { offer: null, canEnter: false };
  let referrer: string | null = null;
  if (data.referred_by) {
    const { data: shop } = await db
      .from("company")
      .select("name")
      .eq("id", data.referred_by)
      .maybeSingle();
    referrer = (shop?.name as string | undefined) ?? null;
  }
  const offer = offerFromRow(data, referrer);
  return {
    offer,
    canEnter:
      !offer &&
      data.plan !== "demo" &&
      !data.stripe_subscription_id &&
      data.status !== "canceled" &&
      data.status !== "past_due",
  };
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
 * Applies a billing event, if it is one: the subscription Checkout finishing, the
 * subscription changing, or a Sundeck Pro bill paid (the referral reward). Returns false for
 * anything else.
 */
export async function applyBillingEvent(
  event: Stripe.Event,
  db: SupabaseClient,
  stripe: Stripe | null = stripeClient(),
): Promise<boolean> {
  // Sundeck Pro subscriptions live on the platform account. An event from a shop's connected
  // account carries metadata that shop wrote, so it never changes anyone's subscription
  // (security audit, 2026-10-17).
  if (event.account) return false;
  if (event.type === "invoice.paid") {
    await rewardReferral(event.data.object as Stripe.Invoice, db, stripe);
    return true;
  }
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
 * Give a Month, Get a Month (owner, 2026-11-23): when a shop that used another shop's referral
 * code first pays a real bill, the shop that shared the code gets its free month, once.
 * Subscribed: a Stripe balance credit of its current monthly price, which its next bill uses
 * up (the idempotency key keeps a retried event from crediting twice). Still on a trial with no
 * Stripe subscription: a month more of trial. A demo or canceled shop gets nothing, recorded.
 */
export async function rewardReferral(
  invoice: Stripe.Invoice,
  db: SupabaseClient,
  stripe: Stripe | null = stripeClient(),
): Promise<"credit" | "trial" | "none" | null> {
  const customer =
    typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? null);
  if (!customer || !(invoice.amount_paid > 0)) return null;
  const { data: referred, error } = await db
    .from("subscription")
    .select("company_id, referred_by, referral_rewarded_at")
    .eq("stripe_customer_id", customer)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!referred?.referred_by || referred.referral_rewarded_at) return null;
  const referrerId = referred.referred_by as string;
  const { data: referrer, error: referrerError } = await db
    .from("subscription")
    .select("plan, status, stripe_customer_id, stripe_subscription_id")
    .eq("company_id", referrerId)
    .maybeSingle();
  if (referrerError) throw new Error(referrerError.message);
  let reward: "credit" | "trial" | "none" = "none";
  let cents: number | null = null;
  if (referrer && referrer.plan !== "demo") {
    if (
      referrer.stripe_subscription_id &&
      referrer.stripe_customer_id &&
      referrer.status !== "canceled"
    ) {
      if (!stripe) throw new BillingNotConfigured();
      const { data: shop } = await db
        .from("company")
        .select("name")
        .eq("id", referred.company_id)
        .maybeSingle();
      cents = (await shopPrice(db, referrerId)).cents;
      await stripe.customers.createBalanceTransaction(
        referrer.stripe_customer_id as string,
        {
          amount: -cents,
          currency: "usd",
          description: `A free month for referring ${(shop?.name as string | undefined) ?? "a shop"}`,
          metadata: { kind: "referral_reward", referred_company_id: referred.company_id as string },
        },
        { idempotencyKey: `referral_reward_${referred.company_id as string}` },
      );
      reward = "credit";
    } else if (referrer.status === "trialing") {
      reward = "trial";
    }
  }
  const { data: given, error: rewardError } = await db.rpc("referral_reward", {
    referred: referred.company_id,
    reward,
    cents,
  });
  if (rewardError) throw new Error(rewardError.message);
  return given ? reward : null;
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
  services: Services;
  /** The people billed: the team size picked, or the active people when more. */
  people: number;
  /** The active people: the fewest the owner can pick. */
  active: number;
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
  return { ...price, problem };
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
 * Marks a new shop's setup done, so its owner goes on into the app. Runs once the card is in
 * (Checkout) or a demo code was used. The questionnaire whose choices this used to apply is
 * gone (owner, 2026-10-24): a new shop keeps the defaults (navy report color, no deposit), which
 * the owner changes in Settings. Safe to repeat.
 */
export async function finishOnboarding(db: SupabaseClient, companyId: string): Promise<void> {
  const { error } = await db
    .from("subscription")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .is("onboarded_at", null);
  if (error) throw new Error(error.message);
}

/**
 * The return page from the trial page's Checkout: links the subscription and finishes setup at
 * once, without waiting for the webhook (which does the same). Only for the
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
    stripe,
  );
  // The subscription too, so the trial end Stripe bills is in trial_ends_at before the
  // webhook arrives.
  const subscription =
    typeof s.subscription === "string"
      ? await stripe.subscriptions.retrieve(s.subscription)
      : s.subscription;
  if (subscription?.metadata?.company_id === companyId)
    await applyBillingEvent(
      {
        id: `return_${subscription.id}`,
        type: "customer.subscription.updated",
        data: { object: subscription },
      } as unknown as Stripe.Event,
      db,
      stripe,
    );
  await finishOnboarding(db, companyId);
  return true;
}
