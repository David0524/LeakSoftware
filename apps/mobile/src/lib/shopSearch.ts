import {
  parseRecent,
  rememberRecent,
  searchShop,
  type RecentItem,
  type SearchGroupKey,
  type SearchOpen,
  type SearchRecords,
  type SearchResults,
} from "@leakbook/core";
import type { KeyValue } from "./database";

// One search across the shop (owner, 2026-10-20; docs/plans/search-and-activity.md section 1),
// on the phone: the shared rule in packages/core (searchShop) over this phone's own database,
// so it works offline. The synced rows already follow the visibility rules (a tech in a shop
// set to "Only Their Own" has only their jobs and what goes with them), so search adds no rule
// of its own. Recent is kept in the app's key-value store and cleared on sign out
// (SyncService.clearLocalData). No React here, so it can be tested.

/** Where Recent is kept on this phone (cleared with the rest on sign out). */
export const RECENT_KEY = "search:recent";

interface Kept {
  id: string;
  deleted_at?: string | null;
}

/** The local rows search reads, as the sync layer lists them. */
export interface LocalSearchRows {
  customers: (Kept & {
    name?: string | null;
    company_name?: string | null;
    phone?: string | null;
    email?: string | null;
  })[];
  properties: (Kept & {
    customer_id?: string | null;
    address_line1?: string | null;
    city?: string | null;
  })[];
  jobs: (Kept & {
    number?: number | null;
    type?: string | null;
    status?: string | null;
    scheduled_start?: string | null;
    created_at?: string | null;
    property_id?: string | null;
    bill_to_customer_id?: string | null;
  })[];
  quotes: (Kept & {
    job_id: string;
    number?: number | null;
    status?: string | null;
    total_cents?: number | null;
    created_at?: string | null;
  })[];
  invoices: (Kept & {
    job_id: string;
    number?: number | null;
    status?: string | null;
    total_cents?: number | null;
    amount_paid_cents?: number | null;
    created_at?: string | null;
  })[];
}

/**
 * The phone's rows as search records, joined as the website's search_candidates joins them:
 * a job's customer is its bill-to customer, else the pool's owner; quotes and invoices of a
 * deleted (or missing) job don't show.
 */
export function searchRecords(rows: LocalSearchRows): SearchRecords {
  const live = <T extends Kept>(list: T[]) => list.filter((r) => !r.deleted_at);
  const customers = new Map(live(rows.customers).map((c) => [c.id, c]));
  const properties = new Map(live(rows.properties).map((p) => [p.id, p]));
  const jobs = live(rows.jobs);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const customerName = (job: LocalSearchRows["jobs"][number] | undefined) => {
    if (!job) return null;
    const billTo = job.bill_to_customer_id ? customers.get(job.bill_to_customer_id) : undefined;
    const owner = properties.get(job.property_id ?? "")?.customer_id;
    return (billTo ?? customers.get(owner ?? ""))?.name ?? null;
  };
  return {
    customers: [...customers.values()].map((c) => ({
      id: c.id,
      name: c.name ?? "",
      company_name: c.company_name ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
    })),
    pools: [...properties.values()].map((p) => ({
      id: p.id,
      customer_id: p.customer_id ?? null,
      address_line1: p.address_line1 ?? "",
      city: p.city ?? null,
      customer_name: customers.get(p.customer_id ?? "")?.name ?? null,
    })),
    jobs: jobs.map((j) => ({
      id: j.id,
      number: j.number ?? null,
      type: j.type ?? "",
      status: j.status ?? null,
      scheduled_start: j.scheduled_start ?? null,
      created_at: j.created_at ?? null,
      customer_name: customerName(j),
    })),
    quotes: live(rows.quotes)
      .filter((q) => jobById.has(q.job_id))
      .map((q) => ({
        id: q.id,
        job_id: q.job_id,
        number: q.number ?? null,
        status: q.status ?? "",
        total_cents: q.total_cents ?? 0,
        created_at: q.created_at ?? null,
        customer_name: customerName(jobById.get(q.job_id)),
      })),
    invoices: live(rows.invoices)
      .filter((i) => jobById.has(i.job_id))
      .map((i) => ({
        id: i.id,
        job_id: i.job_id,
        number: i.number ?? null,
        status: i.status ?? "",
        total_cents: i.total_cents ?? 0,
        amount_paid_cents: i.amount_paid_cents ?? 0,
        created_at: i.created_at ?? null,
        customer_name: customerName(jobById.get(i.job_id)),
      })),
  };
}

/** Search the phone's rows: grouped, 5 a group; `group` is See All (every match in it). */
export function searchPhone(
  query: string,
  records: SearchRecords,
  options: { now: Date; timeZone: string; group?: SearchGroupKey | null },
): SearchResults {
  return searchShop(query, records, {
    now: options.now,
    timeZone: options.timeZone,
    ...(options.group ? { group: options.group, limit: Infinity } : {}),
  });
}

/**
 * The app route a result or Recent entry opens: a customer, or a job (a quote or an invoice
 * opens its job at Wrap-Up, where its Quotes and Invoice are).
 */
export function openPath(open: SearchOpen): string {
  if (open.screen === "customer") return `/customers/${open.id}`;
  return `/jobs/${open.id}${open.section ? "?section=wrapup" : ""}`;
}

// ---------------------------------------------------------------------------
// Recent: the last 8 records opened on this phone
// ---------------------------------------------------------------------------

export function loadRecent(kv: Pick<KeyValue, "get">): RecentItem[] {
  try {
    return parseRecent(JSON.parse(kv.get(RECENT_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function saveRecent(kv: Pick<KeyValue, "get" | "set">, item: RecentItem): RecentItem[] {
  const next = rememberRecent(loadRecent(kv), item);
  try {
    kv.set(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Not kept; nothing else depends on it.
  }
  return next;
}

export function clearRecent(kv: Pick<KeyValue, "remove">): void {
  try {
    kv.remove(RECENT_KEY);
  } catch {
    // Nothing kept to clear.
  }
}

/**
 * A customer or job screen was shown: it goes first under Recent. A job opened from one of its
 * quotes or invoices is already there as that quote or invoice, so it isn't added twice (as
 * the website's RememberRecent).
 */
export function rememberOpened(
  kv: Pick<KeyValue, "get" | "set">,
  item: RecentItem,
): RecentItem[] | null {
  const first = loadRecent(kv)[0];
  if (item.kind === "job" && first && first.open.screen === "job" && first.open.id === item.id)
    return null;
  return saveRecent(kv, {
    kind: item.kind,
    id: item.id,
    title: item.title,
    detail: item.detail,
    open: { screen: item.open.screen, id: item.id },
  });
}
