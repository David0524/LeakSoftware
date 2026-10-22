// Customer counts (owner, 2026-10-22): the number beside each choice of the Customers list's
// Show menu ("On a Plan (65)"), and the Dashboard's Customers and On a plan trackers. One
// definition everywhere, so the Dashboard's numbers match the filter they open.
//
// The website counts on the server (public.customer_counts, one query); the apps count their
// synced rows with these rules. Swift port: apps/ios/Sources/SundeckCore/CustomerCounts.swift.

/** Customer kinds, plural for the Show menu, in menu order. */
export const CUSTOMER_KIND_PLURALS: Record<string, string> = {
  homeowner: "Homeowners",
  pool_company: "Pool Companies",
  builder: "Builders",
  insurer: "Insurers",
  property_manager: "Property Managers",
  other: "Other",
};

/** The Dashboard's "+4 in 30 days" looks back this many days. */
export const CUSTOMERS_ADDED_DAYS = 30;

/** The Dashboard trackers' labels (sentence case, as the other stat cards). */
export const CUSTOMER_TRACKER_LABELS = { customers: "Customers", onPlan: "On a plan" } as const;

export interface PlanForCount {
  customer_id: string;
  ends_on?: string | null;
  deleted_at?: string | null;
}

/**
 * Whether a maintenance plan puts its customer "On a Plan" today: not deleted, and not ended
 * before `today` (YYYY-MM-DD, the shop's day). A paused plan still counts: the customer is on
 * it, the visits are only on hold.
 */
export function planIsCurrent(plan: PlanForCount, today: string): boolean {
  return !plan.deleted_at && (!plan.ends_on || plan.ends_on >= today);
}

/** The customers with a current plan, sorted, each once. */
export function customersOnPlan(plans: readonly PlanForCount[], today: string): string[] {
  return [
    ...new Set(plans.filter((p) => planIsCurrent(p, today)).map((p) => p.customer_id)),
  ].sort();
}

export interface CustomerForCount {
  id: string;
  kind?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
}

export interface CustomerCounts {
  /** All Customers. */
  all: number;
  /** On a Plan. */
  plan: number;
  /** No Plan. */
  no_plan: number;
  /** Each kind's count (kinds with none are left out). */
  kinds: Record<string, number>;
  /** Added since the cutoff (the Dashboard's "+4 in 30 days"). */
  added: number;
}

/**
 * The cutoff for "added", `CUSTOMERS_ADDED_DAYS` before `now`, as an ISO time in UTC
 * ("2026-09-22T17:00:00.000Z").
 */
export function customersAddedSince(now: Date): string {
  return new Date(now.getTime() - CUSTOMERS_ADDED_DAYS * 86_400_000).toISOString();
}

/** "2026-10-12 10:00:00+00" or "2026-10-12T10:00:00.123Z" to "2026-10-12T10:00:00" (UTC). */
function utcSeconds(iso: string): string {
  return iso.replace(" ", "T").slice(0, 19);
}

/**
 * Counts for the Show menu and the Dashboard, from the customers (already searched, when the
 * list is) and the customers on a plan (`customersOnPlan`). Deleted customers don't count.
 * `addedSince` comes from `customersAddedSince`; times are compared in UTC to the second.
 */
export function countCustomers(
  customers: readonly CustomerForCount[],
  onPlan: readonly string[],
  addedSince: string,
): CustomerCounts {
  const planned = new Set(onPlan);
  const since = utcSeconds(addedSince);
  const counts: CustomerCounts = { all: 0, plan: 0, no_plan: 0, kinds: {}, added: 0 };
  for (const c of customers) {
    if (c.deleted_at) continue;
    counts.all += 1;
    if (planned.has(c.id)) counts.plan += 1;
    else counts.no_plan += 1;
    const kind = c.kind ?? "homeowner";
    counts.kinds[kind] = (counts.kinds[kind] ?? 0) + 1;
    if (c.created_at && utcSeconds(c.created_at) >= since) counts.added += 1;
  }
  return counts;
}

/** A Show choice's count: all, plan, no_plan, or a kind (0 when it has none). */
export function customerShowCount(counts: CustomerCounts, show: string): number {
  if (show === "all" || show === "plan" || show === "no_plan") return counts[show];
  return counts.kinds[show] ?? 0;
}

/** "1,204", as the menus print counts. */
export function formatCount(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export interface CustomerShowOption {
  value: string;
  label: string;
}

/**
 * The Show menu: All Customers, On a Plan and No Plan (shops that offer pool service), then the
 * kinds. With counts, each label ends with its count: "On a Plan (65)", "Builders (0)".
 */
export function customerShowOptions(
  offersPool: boolean,
  counts?: CustomerCounts | null,
): CustomerShowOption[] {
  const options: CustomerShowOption[] = [
    { value: "all", label: "All Customers" },
    ...(offersPool
      ? [
          { value: "plan", label: "On a Plan" },
          { value: "no_plan", label: "No Plan" },
        ]
      : []),
    ...Object.entries(CUSTOMER_KIND_PLURALS).map(([value, label]) => ({ value, label })),
  ];
  if (!counts) return options;
  return options.map((o) => ({
    value: o.value,
    label: `${o.label} (${formatCount(customerShowCount(counts, o.value))})`,
  }));
}

/** The Customers tracker's note: "+4 in 30 days", or "None new in 30 days". */
export function customersAddedNote(added: number): string {
  return added > 0
    ? `+${formatCount(added)} in ${CUSTOMERS_ADDED_DAYS} days`
    : `None new in ${CUSTOMERS_ADDED_DAYS} days`;
}

/** The On a plan tracker's note: "52% of customers", or "No customers yet". */
export function onPlanShareNote(plan: number, all: number): string {
  return all > 0 ? `${Math.round((plan / all) * 100)}% of customers` : "No customers yet";
}
