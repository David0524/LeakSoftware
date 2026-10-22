import type { Cents } from "./money";
import { centsToDollars, toCsv } from "./invoice";
import { companyServices, type Services } from "./models";
import { servicesPriceCents } from "./plans";

// The Admin portal's numbers (owner, 2026-10-22: "Analytics, customer data, finances"). Shops
// come from public.admin_shops(), subscription history from public.admin_metrics(). Prices
// are the same rule billing charges (plans.ts): a shop's package and its active people.

/** One shop as admin_shops() returns it. */
export interface AdminShop {
  id: string;
  name: string;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  timezone: string;
  created_at: string;
  services: string;
  status: "trialing" | "active" | "past_due" | "canceled";
  plan: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  access_code: string | null;
  card_required: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  locked: boolean;
  people: number;
  owner_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  last_active_at: string | null;
  jobs_30d: number;
  jobs_total: number;
  customers: number;
  payments_on: boolean;
  payouts_on: boolean;
  payments_details_submitted: boolean;
  stripe_account_id: string | null;
}

/**
 * Where a shop stands with Sundeck Pro:
 * - trial: trialing (with or without a card yet); `trial_ended` when it ran out unpaid.
 * - paying: Stripe bills it and it is paid up.
 * - past_due: Stripe couldn't collect.
 * - canceled.
 * - demo: no charge (a demo code, the built-in demo, or staff's Make Demo Shop).
 */
export type Standing = "trial" | "trial_ended" | "paying" | "past_due" | "canceled" | "demo";

export const STANDING_LABELS: Record<Standing, string> = {
  trial: "Trial",
  trial_ended: "Trial Ended",
  paying: "Paying",
  past_due: "Past Due",
  canceled: "Canceled",
  demo: "Demo",
};

export function shopStanding(
  s: Pick<AdminShop, "status" | "plan" | "stripe_subscription_id" | "locked">,
): Standing {
  if (s.plan === "demo") return "demo";
  if (s.status === "canceled") return "canceled";
  if (s.status === "past_due") return "past_due";
  if (s.status === "active") return s.stripe_subscription_id ? "paying" : "demo";
  return s.locked ? "trial_ended" : "trial";
}

const services = (v: string): Services => companyServices({ services: v });

/** What the shop's package costs a month for its active people (whatever its standing). */
export function shopPriceCents(s: Pick<AdminShop, "services" | "people">): Cents {
  return servicesPriceCents(services(s.services), Math.max(1, s.people));
}

/** Monthly recurring revenue: the price of every shop Stripe bills (paying or past due). */
export function mrrCents(shops: AdminShop[]): Cents {
  return shops.reduce((sum, s) => {
    const st = shopStanding(s);
    return st === "paying" || st === "past_due" ? sum + shopPriceCents(s) : sum;
  }, 0);
}

export interface SubscriptionEvent {
  company_id: string;
  status: string;
  plan: string;
  at: string;
}

/** A shop's status and plan as of `when`, from its history (null before it had one). */
function asOf(events: SubscriptionEvent[], when: number): { status: string; plan: string } | null {
  let last: SubscriptionEvent | null = null;
  for (const e of events) {
    if (Date.parse(e.at) <= when) last = e;
    else break;
  }
  return last ? { status: last.status, plan: last.plan } : null;
}

function byShop(events: SubscriptionEvent[]): Map<string, SubscriptionEvent[]> {
  const map = new Map<string, SubscriptionEvent[]>();
  for (const e of [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const list = map.get(e.company_id) ?? [];
    list.push(e);
    map.set(e.company_id, list);
  }
  return map;
}

/** The first moment of each of the last `months` months (UTC), oldest first. */
export function monthStarts(now: Date, months = 12): Date[] {
  return Array.from(
    { length: months },
    (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1)),
  );
}

/**
 * MRR at the end of each month (the current month: now), from the subscription history, at
 * each shop's price today. Only shops Stripe bills count; shops that no longer exist don't. History starts
 * 2026-10-22, so earlier months only know when each shop started its trial.
 */
export function mrrHistory(
  shops: AdminShop[],
  events: SubscriptionEvent[],
  now: Date,
  months = 12,
): { month: string; cents: Cents }[] {
  // Only shops Stripe bills count, as in mrrCents: an active shop with no subscription is comped.
  const prices = new Map(
    shops.filter((s) => s.stripe_subscription_id).map((s) => [s.id, shopPriceCents(s)]),
  );
  const history = byShop(events);
  return monthStarts(now, months).map((start, i, all) => {
    const next = all[i + 1];
    const end = next ? next.getTime() - 1 : now.getTime();
    let cents = 0;
    for (const [id, list] of history) {
      const price = prices.get(id);
      const st = asOf(list, end);
      if (price && st && (st.status === "active" || st.status === "past_due") && st.plan !== "demo")
        cents += price;
    }
    return { month: start.toISOString().slice(0, 10), cents };
  });
}

/** Shops that moved to canceled in [from, to), with the price they paid. */
export function canceledBetween(
  shops: AdminShop[],
  events: SubscriptionEvent[],
  from: Date,
  to: Date,
): { shop: AdminShop; at: string; cents: Cents }[] {
  const byId = new Map(shops.map((s) => [s.id, s]));
  const out: { shop: AdminShop; at: string; cents: Cents }[] = [];
  for (const [id, list] of byShop(events)) {
    list.forEach((e, i) => {
      const t = Date.parse(e.at);
      const before = list[i - 1];
      const shop = byId.get(id);
      if (
        shop &&
        e.status === "canceled" &&
        before?.status !== "canceled" &&
        t >= from.getTime() &&
        t < to.getTime()
      )
        out.push({ shop, at: e.at, cents: shopPriceCents(shop) });
    });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Trials that end in the next `days` days, soonest first. */
export function trialsEnding(shops: AdminShop[], now: Date, days: number): AdminShop[] {
  const until = now.getTime() + days * 86_400_000;
  return shops
    .filter((s) => {
      const end = s.trial_ends_at ? Date.parse(s.trial_ends_at) : NaN;
      return shopStanding(s) === "trial" && end >= now.getTime() && end <= until;
    })
    .sort((a, b) => Date.parse(a.trial_ends_at!) - Date.parse(b.trial_ends_at!));
}

export const SERVICES_SHORT: Record<Services, string> = {
  pool: "Pool Maintenance",
  leak: "Leak Detection",
  both: "Both",
};

export function servicesLabel(v: string): string {
  return SERVICES_SHORT[services(v)];
}

/** The Shops list as a spreadsheet. */
export function shopsCsv(shops: AdminShop[]): string {
  return toCsv([
    [
      "Shop",
      "Package",
      "Standing",
      "People",
      "Monthly price",
      "Owner",
      "Owner email",
      "Owner phone",
      "Shop email",
      "Shop phone",
      "City",
      "State",
      "Signed up",
      "Trial ends",
      "Last active",
      "Jobs (30 days)",
      "Jobs (all)",
      "Customers",
      "Payments on",
    ],
    ...shops.map((s) => [
      s.name,
      servicesLabel(s.services),
      STANDING_LABELS[shopStanding(s)],
      s.people,
      centsToDollars(shopPriceCents(s)),
      s.owner_name,
      s.owner_email,
      s.owner_phone,
      s.email,
      s.phone,
      s.city,
      s.state,
      s.created_at.slice(0, 10),
      s.trial_ends_at?.slice(0, 10),
      s.last_active_at?.slice(0, 10),
      s.jobs_30d,
      s.jobs_total,
      s.customers,
      s.payments_on ? "Yes" : "No",
    ]),
  ]);
}

/** Sort keys for the Shops list (column headers). */
export type ShopSort = "name" | "standing" | "people" | "price" | "created" | "active" | "jobs";

export function sortShops(shops: AdminShop[], key: ShopSort, desc: boolean): AdminShop[] {
  const order: Standing[] = ["past_due", "trial_ended", "trial", "paying", "demo", "canceled"];
  const value = (s: AdminShop): string | number => {
    switch (key) {
      case "name":
        return s.name.toLowerCase();
      case "standing":
        return order.indexOf(shopStanding(s));
      case "people":
        return s.people;
      case "price":
        return shopPriceCents(s);
      case "created":
        return Date.parse(s.created_at);
      case "active":
        return s.last_active_at ? Date.parse(s.last_active_at) : 0;
      case "jobs":
        return s.jobs_30d;
    }
  };
  return [...shops].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    const c = x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name);
    return desc ? -c : c;
  });
}

/** Search the Shops list: name, owner, emails, phones, city. */
export function searchShops(shops: AdminShop[], query: string): AdminShop[] {
  const q = query.trim().toLowerCase();
  if (!q) return shops;
  const digits = q.replace(/\D/g, "");
  return shops.filter((s) => {
    const text = [s.name, s.owner_name, s.owner_email, s.email, s.city, s.state]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (text.includes(q)) return true;
    if (digits.length >= 4)
      return [s.phone, s.owner_phone].some((p) => p?.replace(/\D/g, "").includes(digits));
    return false;
  });
}
