// "How did you hear about us?" on sign-up (owner, 2026-10-24), the same on the website and both
// apps. Optional: it never blocks a sign-up. Kept with the new shop on subscription.heard_from
// (and heard_from_other for "Other"), shown to staff on the Admin portal's Shops pages.
//
// The options are a constant here, not database rows: they show before anyone is signed in
// (anon reads no tables) on four platforms, two of them apps that have no database until
// sign-in. The iPhone's copy (SundeckCore/HeardFrom.swift) is checked against this one by the
// heard-from fixtures. The database only checks a key's shape, so adding an option is a change
// here and in the Swift copy, with no migration.

export const HEARD_FROM_QUESTION = "How did you hear about us?";
/** The select's first entry while nothing is chosen. */
export const HEARD_FROM_NONE = "Choose One";
/** The short text field "Other" reveals. */
export const HEARD_FROM_OTHER_PLACEHOLDER = "Tell us where";
/** Longest "Other" answer kept, in characters. */
export const HEARD_FROM_OTHER_MAX = 100;

/** In the order the owner set. A key is also a sign-up link's `?from=<key>`. */
export const HEARD_FROM_OPTIONS = [
  { key: "google", label: "Google" },
  { key: "app_store", label: "App Store or Google Play" },
  { key: "pool_pro", label: "Another Pool Pro" },
  { key: "customer_referral", label: "Customer Referral" },
  { key: "pool_supplier", label: "Pool Supplier" },
  { key: "route_broker", label: "Route Broker" },
  { key: "social_media", label: "Social Media" },
  { key: "industry_group", label: "Industry Group or Forum" },
  { key: "trade_show", label: "Trade Show or Event" },
  { key: "advertisement", label: "Advertisement" },
  { key: "card", label: "Laminate Card" },
  { key: "other", label: "Other" },
] as const;

export type HeardFrom = (typeof HEARD_FROM_OPTIONS)[number]["key"];

/** A known option's key (any case, spaces around ignored), else null. */
export function parseHeardFrom(value: unknown): HeardFrom | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return HEARD_FROM_OPTIONS.find((o) => o.key === v)?.key ?? null;
}

/** What "Other" said: one line, trimmed, at most HEARD_FROM_OTHER_MAX characters; else null. */
export function heardFromOther(key: HeardFrom | null, text: unknown): string | null {
  if (key !== "other" || typeof text !== "string") return null;
  const line = text.replace(/\s+/g, " ").trim();
  return line ? Array.from(line).slice(0, HEARD_FROM_OTHER_MAX).join("").trim() : null;
}

/**
 * The option a sign-up link picks: `?from=<key>`, or `?ref=<key>` (a printed card says
 * `?from=card` or `?ref=card`). Unknown values pick nothing.
 */
export function heardFromLink(params: { from?: unknown; ref?: unknown }): HeardFrom | null {
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  return parseHeardFrom(one(params.from)) ?? parseHeardFrom(one(params.ref));
}

/** For staff: the option's label, with what "Other" said; null when not answered. */
export function heardFromText(
  key: string | null | undefined,
  other?: string | null,
): string | null {
  if (!key) return null;
  const label = HEARD_FROM_OPTIONS.find((o) => o.key === key)?.label ?? key;
  return key === "other" && other ? `${label}: ${other}` : label;
}

export interface HeardFromCount {
  /** Null: not answered. */
  key: string | null;
  label: string;
  count: number;
}

/**
 * Shops by where they heard of Sundeck Pro, most first (ties in the options' order), then
 * those that didn't answer. Options nobody picked are left out.
 */
export function heardFromCounts(rows: { heard_from?: string | null }[]): HeardFromCount[] {
  const counts = new Map<string | null, number>();
  for (const r of rows) {
    const k = r.heard_from || null;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const order = (k: string | null) => {
    const i = HEARD_FROM_OPTIONS.findIndex((o) => o.key === k);
    return i === -1 ? HEARD_FROM_OPTIONS.length : i;
  };
  const answered = [...counts.entries()]
    .filter(([k]) => k !== null)
    .sort(([a, x], [b, y]) => y - x || order(a) - order(b) || String(a).localeCompare(String(b)))
    .map(([key, count]) => ({ key, label: heardFromText(key) ?? "", count }));
  const none = counts.get(null);
  return none ? [...answered, { key: null, label: "No answer", count: none }] : answered;
}
