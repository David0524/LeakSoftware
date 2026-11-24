import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { formatCents } from "@leakbook/core";
import { adminClient } from "./admin";
import { BillingNotConfigured, promoCoupon, shopPrice, syncSubscriptionPrice } from "./billing";
import { StaffError } from "./staff-error";
import { stripeClient } from "./stripe";

// The Admin portal's control of a shop's own Sundeck Pro billing (owner, 2026-11-24: "full
// control over pricing, deals, etc."; "how would we reverse a charge?"). Everything here acts
// on the platform Stripe account (the shop's subscription), never on a shop's own Connect
// account: a shop's customers are refunded by the shop (owner: "ok agreed").

export interface ShopCharge {
  id: string;
  amount: number;
  refunded: number;
  created: string;
  description: string;
  status: string;
  receiptUrl: string | null;
}

export interface ShopStripeBilling {
  status: string | null;
  /** Set to end at the period's end (Cancel at Period End). */
  cancelAt: string | null;
  canceledAt: string | null;
  /** Billing paused: invoices are voided while it lasts. */
  paused: boolean;
  resumesAt: string | null;
  currentPeriodEnd: string | null;
  /** Credit on the account (free months, referral months), in cents. */
  creditCents: number;
  /** The coupons on the subscription, by name. */
  discounts: string[];
  charges: ShopCharge[];
}

const iso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);

function need(): { stripe: Stripe; db: SupabaseClient } {
  const stripe = stripeClient();
  const db = adminClient();
  if (!stripe || !db) throw new BillingNotConfigured();
  return { stripe, db };
}

async function shopStripeIds(
  db: SupabaseClient,
  companyId: string,
): Promise<{ customer: string | null; subscription: string | null; status: string | null }> {
  const { data, error } = await db
    .from("subscription")
    .select("stripe_customer_id, stripe_subscription_id, status")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    customer: (data?.stripe_customer_id as string | null) ?? null,
    subscription: (data?.stripe_subscription_id as string | null) ?? null,
    status: (data?.status as string | null) ?? null,
  };
}

/** What Stripe has for the shop now: its subscription's state and its last 24 charges. */
export async function shopStripeBilling(
  customer: string | null,
  subscription: string | null,
): Promise<ShopStripeBilling | null> {
  const stripe = stripeClient();
  if (!stripe || !customer) return null;
  const [sub, charges, cust] = await Promise.all([
    subscription
      ? stripe.subscriptions.retrieve(subscription, { expand: ["discounts"] })
      : Promise.resolve(null),
    stripe.charges.list({ customer, limit: 24 }),
    stripe.customers.retrieve(customer),
  ]);
  const balance = "deleted" in cust && cust.deleted ? 0 : (cust as Stripe.Customer).balance;
  return {
    status: sub?.status ?? null,
    cancelAt: iso(sub?.cancel_at),
    canceledAt: iso(sub?.canceled_at),
    paused: Boolean(sub?.pause_collection),
    resumesAt: iso(sub?.pause_collection?.resumes_at),
    currentPeriodEnd: iso(sub?.items?.data?.[0]?.current_period_end),
    creditCents: balance < 0 ? -balance : 0,
    discounts: (sub?.discounts ?? []).flatMap((d) => {
      if (typeof d === "string") return [];
      const coupon = d.source?.coupon;
      if (!coupon) return ["Discount"];
      return [typeof coupon === "string" ? coupon : (coupon.name ?? coupon.id)];
    }),
    charges: charges.data.map((c) => ({
      id: c.id,
      amount: c.amount,
      refunded: c.amount_refunded,
      created: new Date(c.created * 1000).toISOString(),
      description: c.description ?? "Sundeck Pro",
      status: c.status,
      receiptUrl: c.receipt_url ?? null,
    })),
  };
}

/** Refunds a subscription charge, all of what's left or part, after checking it is the shop's. */
export async function refundShopCharge(
  companyId: string,
  chargeId: string,
  amountCents: number | null,
): Promise<string> {
  const { stripe, db } = need();
  const ids = await shopStripeIds(db, companyId);
  const charge = await stripe.charges.retrieve(chargeId);
  const owner = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
  if (!ids.customer || owner !== ids.customer)
    throw new StaffError("That charge isn’t this shop’s.");
  const left = charge.amount - charge.amount_refunded;
  if (left <= 0) throw new StaffError("That charge is already refunded.");
  if (amountCents !== null && (amountCents <= 0 || amountCents > left))
    throw new StaffError(`Refund ${formatCents(left)} or less.`);
  const refund = await stripe.refunds.create(
    {
      charge: chargeId,
      ...(amountCents !== null ? { amount: amountCents } : {}),
      metadata: { kind: "staff_refund", company_id: companyId },
    },
    {
      idempotencyKey: `staff-refund-${chargeId}-${charge.amount_refunded}-${amountCents ?? "all"}`,
    },
  );
  return `Refunded ${formatCents(refund.amount)}.`;
}

/** Cancel now, cancel at the period's end, or undo a cancel at the period's end. */
export async function setShopCancel(
  companyId: string,
  when: "now" | "period_end" | "keep",
): Promise<string> {
  const { stripe, db } = need();
  const ids = await shopStripeIds(db, companyId);
  if (!ids.subscription) throw new StaffError("Stripe doesn’t bill this shop.");
  if (when === "now") {
    await stripe.subscriptions.cancel(ids.subscription);
    return "Subscription canceled. The shop is read-only now.";
  }
  const sub = await stripe.subscriptions.update(ids.subscription, {
    cancel_at_period_end: when === "period_end",
  });
  if (when === "keep") return "The subscription carries on.";
  const end = iso(sub.cancel_at);
  return end
    ? `The subscription ends ${new Date(end).toLocaleDateString("en-US", { dateStyle: "medium" })}.`
    : "The subscription ends at the end of this period.";
}

/** Pause billing (invoices are voided, the shop keeps working) until a date or until resumed. */
export async function setShopPause(
  companyId: string,
  pause: boolean,
  resumesAt: Date | null,
): Promise<string> {
  const { stripe, db } = need();
  const ids = await shopStripeIds(db, companyId);
  if (!ids.subscription) throw new StaffError("Stripe doesn’t bill this shop.");
  await stripe.subscriptions.update(ids.subscription, {
    pause_collection: pause
      ? {
          behavior: "void",
          ...(resumesAt ? { resumes_at: Math.floor(resumesAt.getTime() / 1000) } : {}),
        }
      : "",
  });
  return pause ? "Billing paused. The shop keeps working." : "Billing resumed.";
}

/**
 * Free months for a shop Stripe bills: a balance credit of that many months at its price
 * (as referral months are), which its next bills use up. Returns the cents credited.
 */
export async function creditFreeMonths(
  companyId: string,
  months: number,
  why: string,
  key: string,
): Promise<number> {
  const { stripe, db } = need();
  const ids = await shopStripeIds(db, companyId);
  if (!ids.customer || !ids.subscription) throw new StaffError("Stripe doesn’t bill this shop.");
  const cents = (await shopPrice(db, companyId)).cents * months;
  if (cents <= 0) return 0;
  await stripe.customers.createBalanceTransaction(
    ids.customer,
    {
      amount: -cents,
      currency: "usd",
      description: why,
      metadata: { kind: "staff_free_months", months: String(months) },
    },
    { idempotencyKey: key },
  );
  return cents;
}

/** A code's percent off on a subscribed shop's subscription (a Stripe coupon). */
export async function applyCouponToShop(
  companyId: string,
  percentOff: number,
  paidMonths: number | null,
): Promise<void> {
  const { stripe, db } = need();
  const ids = await shopStripeIds(db, companyId);
  if (!ids.subscription) throw new StaffError("Stripe doesn’t bill this shop.");
  const coupon = await promoCoupon(stripe, percentOff, paidMonths, null);
  await stripe.subscriptions.update(ids.subscription, { discounts: [{ coupon }] });
}

/** Sends the shop's price to Stripe now; a sentence for staff when Stripe refused. */
export async function pushShopPrice(companyId: string): Promise<string | null> {
  try {
    await syncSubscriptionPrice(companyId);
    return null;
  } catch (e) {
    console.error("[admin] price sync:", e);
    return "Saved, but Stripe didn’t take the new price yet. The daily run tries again.";
  }
}
