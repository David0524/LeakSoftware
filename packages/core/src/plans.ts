import type { Cents } from "./money";

// Sundeck Pro's two packages and their monthly prices (owner, 2026-10-16: flat tiers by team size,
// unlimited pools, pool maintenance above leak detection; see docs/DECISIONS.md). The website's
// pricing section reads these; billing in Stripe is to be set to match.

export type PlanId = "leak" | "maintenance";

export interface Tier {
  name: string;
  /** People included (owners, office staff, and techs each count). */
  upTo: number;
  priceCents: Cents;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Smallest first. A team past the last tier pays it plus `perExtraCents` per person. */
  tiers: Tier[];
  perExtraCents: Cents;
}

export const PLANS: Record<PlanId, Plan> = {
  maintenance: {
    id: "maintenance",
    name: "Pool Maintenance",
    tiers: [
      { name: "Starter", upTo: 2, priceCents: 7_900 },
      { name: "Team", upTo: 6, priceCents: 14_900 },
      { name: "Fleet", upTo: 12, priceCents: 24_900 },
    ],
    perExtraCents: 1_500,
  },
  leak: {
    id: "leak",
    name: "Leak Detection",
    tiers: [
      { name: "Solo", upTo: 1, priceCents: 4_900 },
      { name: "Team", upTo: 4, priceCents: 9_900 },
    ],
    perExtraCents: 2_500,
  },
};

/** A shop that does both: a Pool Maintenance tier plus this for the leak side. */
export const BOTH_ADDON_CENTS: Cents = 4_900;

const people = (users: number) => Math.max(1, Math.floor(users));

// ---------------------------------------------------------------------------
// Prices staff set in the Admin portal (owner, 2026-11-24: "full control over pricing")
// ---------------------------------------------------------------------------

/**
 * The whole price list: both packages' tiers and the Both add-on. Staff edit it in Admin ›
 * Pricing; each save is a new row of public.price_list, and the newest is what new shops pay.
 * A shop keeps the list it subscribed under (owner: existing shops keep their price).
 */
export interface PriceList {
  maintenance: Plan;
  leak: Plan;
  bothAddonCents: Cents;
}

/** The prices before staff set any (and the fallback when the database has none). */
export const DEFAULT_PRICES: PriceList = {
  maintenance: PLANS.maintenance,
  leak: PLANS.leak,
  bothAddonCents: BOTH_ADDON_CENTS,
};

/** The most a tier, the per-person price, or the add-on can be ($10,000 a month). */
export const PRICE_MAX_CENTS = 1_000_000;

const PLAN_IDS: PlanId[] = ["maintenance", "leak"];

const centsOk = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= PRICE_MAX_CENTS;

/**
 * Why a price list can't be saved, or null when it can: each package needs 1 to 6 tiers with
 * a name, more people than the one before, and a price above the one before (whole cents,
 * $10,000 at most); the per-person and add-on prices are whole cents too.
 */
export function priceListProblem(p: PriceList): string | null {
  for (const id of PLAN_IDS) {
    const plan = p[id];
    const label = DEFAULT_PRICES[id].name;
    if (!plan || !Array.isArray(plan.tiers) || plan.tiers.length < 1 || plan.tiers.length > 6)
      return `${label} needs 1 to 6 tiers.`;
    let upTo = 0;
    let price = 0;
    for (const t of plan.tiers) {
      const name = typeof t.name === "string" ? t.name.trim() : "";
      if (!name || name.length > 30) return `Give each ${label} tier a name (up to 30 letters).`;
      if (!Number.isInteger(t.upTo) || t.upTo <= upTo || t.upTo > 500)
        return `Each ${label} tier is for more people than the one before.`;
      if (!centsOk(t.priceCents) || t.priceCents <= 0) return `Each ${label} tier needs a price.`;
      if (t.priceCents <= price) return `Each ${label} tier costs more than the one before.`;
      upTo = t.upTo;
      price = t.priceCents;
    }
    if (!centsOk(plan.perExtraCents)) return `${label}’s price per extra person isn’t valid.`;
  }
  if (!centsOk(p.bothAddonCents)) return "The Both add-on price isn’t valid.";
  return null;
}

/** A price list as public.price_list stores it (snake_case JSON). */
export function priceListToJson(p: PriceList): Record<string, unknown> {
  const plan = (x: Plan) => ({
    tiers: x.tiers.map((t) => ({ name: t.name.trim(), up_to: t.upTo, price_cents: t.priceCents })),
    per_extra_cents: x.perExtraCents,
  });
  return {
    maintenance: plan(p.maintenance),
    leak: plan(p.leak),
    both_addon_cents: p.bothAddonCents,
  };
}

/** A stored price list, or the default prices when it is missing or not valid. */
export function priceListFromJson(json: unknown): PriceList {
  if (!json || typeof json !== "object") return DEFAULT_PRICES;
  const o = json as Record<string, unknown>;
  const plan = (id: PlanId): Plan | null => {
    const x = o[id] as { tiers?: unknown; per_extra_cents?: unknown } | undefined;
    if (!x || !Array.isArray(x.tiers)) return null;
    return {
      id,
      name: DEFAULT_PRICES[id].name,
      tiers: (x.tiers as { name?: unknown; up_to?: unknown; price_cents?: unknown }[]).map((t) => ({
        name: String(t?.name ?? ""),
        upTo: Number(t?.up_to),
        priceCents: Number(t?.price_cents),
      })),
      perExtraCents: Number(x.per_extra_cents),
    };
  };
  const maintenance = plan("maintenance");
  const leak = plan("leak");
  if (!maintenance || !leak) return DEFAULT_PRICES;
  const list = { maintenance, leak, bothAddonCents: Number(o.both_addon_cents) };
  return priceListProblem(list) === null ? list : DEFAULT_PRICES;
}

/**
 * One shop's own price (Admin › the shop › Price): a fixed monthly amount or a percent off
 * its standard price, through a date (the last day it applies, in the shop's time zone) or
 * for good. It sets the Stripe subscription's amount; the daily run ends it on time.
 */
export interface PriceOverride {
  kind: "fixed" | "percent";
  /** Fixed: the monthly price in cents. */
  cents: Cents | null;
  /** Percent: 1 to 100. */
  percent: number | null;
  /** YYYY-MM-DD, the last day; null for good. */
  until: string | null;
}

/** A shop's override from its subscription row's columns, or null when it has none. */
export function overrideFromRow(row: {
  custom_price_kind?: string | null;
  custom_price_cents?: number | null;
  custom_percent_off?: number | null;
  custom_price_until?: string | null;
}): PriceOverride | null {
  const until = row.custom_price_until ?? null;
  if (row.custom_price_kind === "fixed" && centsOk(row.custom_price_cents))
    return { kind: "fixed", cents: row.custom_price_cents, percent: null, until };
  const pct = row.custom_percent_off;
  if (
    row.custom_price_kind === "percent" &&
    typeof pct === "number" &&
    Number.isInteger(pct) &&
    pct >= 1 &&
    pct <= 100
  )
    return { kind: "percent", cents: null, percent: pct, until };
  return null;
}

/** True while the override applies on `today` (YYYY-MM-DD in the shop's time zone). */
export function overrideActive(o: PriceOverride | null, today: string): o is PriceOverride {
  return o !== null && (o.until === null || today <= o.until);
}

/** The monthly price after a shop's own price, when it applies today. */
export function overriddenCents(standard: Cents, o: PriceOverride | null, today: string): Cents {
  if (!overrideActive(o, today)) return standard;
  if (o.kind === "fixed") return o.cents ?? standard;
  return Math.round((standard * (100 - (o.percent ?? 0))) / 100);
}

/** The override in words for the portal: "$99.00 a month through Mar 31, 2027". */
export function overrideText(o: PriceOverride): string {
  const what =
    o.kind === "fixed"
      ? `$${((o.cents ?? 0) / 100).toFixed(2)} a month`
      : `${o.percent}% off the standard price`;
  if (!o.until) return what;
  const [y, m, d] = o.until.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${what} through ${date}`;
}

/** The tier a team of `users` people is on (the largest tier past the top one). */
export function planTier(plan: Plan, users: number): Tier {
  return plan.tiers.find((t) => people(users) <= t.upTo) ?? plan.tiers[plan.tiers.length - 1]!;
}

/** People past the largest tier, each paying `perExtraCents`. */
export function extraUsers(plan: Plan, users: number): number {
  return Math.max(0, people(users) - plan.tiers[plan.tiers.length - 1]!.upTo);
}

/** The monthly price for a shop of `users` people. Pools are unlimited. */
export function monthlyPriceCents(plan: Plan, users: number): Cents {
  return planTier(plan, users).priceCents + extraUsers(plan, users) * plan.perExtraCents;
}

// ---------------------------------------------------------------------------
// What pool companies pay elsewhere (the website's comparison, Pool Maintenance only)
// ---------------------------------------------------------------------------

/** When the competitor prices below were last checked against their public pricing. */
export const COMPETITORS_CHECKED = "October 2026";

export interface CompetitorPrice {
  name: string;
  /** How they charge, in words, for the fine print. */
  basis: string;
  monthlyCents: Cents;
}

/**
 * Monthly prices for a pool company of `users` people (one is the office; the rest run routes)
 * and `pools` pools, from public pricing (owner-confirmed for Skimmer): Skimmer $2 a pool with a
 * $98 minimum; Pool Brain $50 plus $65 per field tech; Pool Office Manager $125 for the first
 * user plus $25 for each other user.
 */
export function competitorPrices(users: number, pools: number): CompetitorPrice[] {
  const n = people(users);
  const techs = Math.max(1, n - 1);
  const p = Math.max(0, Math.floor(pools));
  return [
    {
      name: "Skimmer",
      basis: "$2 a pool, $98 minimum",
      monthlyCents: Math.max(9_800, 200 * p),
    },
    {
      name: "Pool Brain",
      basis: "$50 plus $65 per field tech",
      monthlyCents: 5_000 + 6_500 * techs,
    },
    {
      name: "Pool Office Manager",
      basis: "$125 plus $25 per additional user",
      monthlyCents: 12_500 + 2_500 * (n - 1),
    },
  ];
}

/** The plan a shop's services put it on: Both is Pool Maintenance plus the add-on. */
export function planForServices(
  services: "pool" | "leak" | "both",
  prices: PriceList = DEFAULT_PRICES,
): Plan {
  return services === "leak" ? prices.leak : prices.maintenance;
}

/** What a shop pays a month for its services and number of people (Sundeck Pro billing). */
export function servicesPriceCents(
  services: "pool" | "leak" | "both",
  users: number,
  prices: PriceList = DEFAULT_PRICES,
): Cents {
  return (
    monthlyPriceCents(planForServices(services, prices), users) +
    (services === "both" ? prices.bothAddonCents : 0)
  );
}

/**
 * The lines behind a shop's monthly price (owner, 2026-10-19: "When a new customer selects
 * both leaks and maintenance, we need to figure out that pricing"). Both is the Pool
 * Maintenance tier for the team plus a flat leak detection add-on, whatever the team size.
 */
export function servicesPriceLines(
  services: "pool" | "leak" | "both",
  users: number,
  prices: PriceList = DEFAULT_PRICES,
): { label: string; cents: Cents }[] {
  const plan = planForServices(services, prices);
  const lines = [
    {
      label: `${plan.name} · ${planTier(plan, users).name}`,
      cents: monthlyPriceCents(plan, users),
    },
  ];
  if (services === "both")
    lines.push({ label: "Leak Detection add-on", cents: prices.bothAddonCents });
  return lines;
}

// ---------------------------------------------------------------------------
// The team size an owner picks (owner, 2026-11-12: "you can't adjust how many employees you
// have and the pricing")
// ---------------------------------------------------------------------------

/** The most people the team size control goes to, as on the website's pricing. */
export const TEAM_SIZE_MAX = 50;

/** The team size the owner picked (company.settings.team_size), or null when none was. */
export function chosenTeamSize(settings: unknown): number | null {
  const v = (settings as { team_size?: unknown } | null)?.team_size;
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= TEAM_SIZE_MAX ? v : null;
}

/**
 * The people a shop is billed for: the team size the owner picked, or the active people when
 * there are more of them (adding a teammate still moves the price up).
 */
export function billedTeamSize(activePeople: number, chosen: number | null): number {
  return Math.max(people(activePeople), chosen ?? 1);
}

/**
 * A team size from a form or a stepper, or null when it isn't a whole number from the active
 * people (fewer can't be picked) to `TEAM_SIZE_MAX` (or the active people, when more).
 */
export function parseTeamSize(v: unknown, activePeople: number): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  const fewest = people(activePeople);
  if (!Number.isInteger(n) || n < fewest || n > Math.max(fewest, TEAM_SIZE_MAX)) return null;
  return n;
}
