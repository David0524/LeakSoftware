/**
 * Search across the shop (owner, 2026-10-20: "Ok add that search in"; docs/plans/
 * search-and-activity.md, section 1). One rule for every platform: the website runs it over
 * the rows the server found (search_candidates, 20261020000400_search.sql), the phones over
 * their own database. Normalize the query, match, rank, group, cap.
 */

import { JOB_TYPE_LABELS, type JobType } from "./models";
import { formatCents } from "./money";
import { QUOTE_STATUS_LABELS, type QuoteStatus } from "./quote";
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from "./invoice";
import { localDate } from "./job-list";
import { dateFormat } from "./intl";

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export const SEARCH_PLACEHOLDER = "Search customers, jobs, addresses";
/** Characters typed before anything is searched. */
export const SEARCH_MIN_CHARS = 2;
/** Results update this long after the last keystroke. */
export const SEARCH_DEBOUNCE_MS = 200;
/** Rows per group before See All. */
export const SEARCH_GROUP_LIMIT = 5;
/** The website couldn't reach the server. */
export const SEARCH_OFFLINE = "Couldn’t search. Check your connection and try again.";
/** Records kept under Recent, per device. */
export const RECENT_LIMIT = 8;

export const SEARCH_WORDS = {
  recent: "Recent",
  clear: "Clear",
  seeAll: "See All",
  allResults: "All Results",
  cancel: "Cancel",
  search: "Search",
  noRecent: "Customers, jobs, quotes, and invoices you open show here.",
} as const;

/** "No results for “ochoa”." with a hint in secondary text. */
export function noResultsText(query: string): { title: string; hint: string } {
  return {
    title: `No results for “${query.trim()}”.`,
    hint: "Check the spelling, or try a phone number or address.",
  };
}

// ---------------------------------------------------------------------------
// Normalizing
// ---------------------------------------------------------------------------

/** Lower case, accents removed: "José Núñez" -> "jose nunez". */
export function foldText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** The words of a text: letters and digits, folded ("O'Neil-Smith" -> o, neil, smith). */
export function searchWords(value: string | null | undefined): string[] {
  return foldText(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export type SearchNumberKind = "job" | "quote" | "invoice";

const KIND_WORDS: Record<string, SearchNumberKind> = {
  job: "job",
  jobs: "job",
  quote: "quote",
  quotes: "quote",
  invoice: "invoice",
  invoices: "invoice",
  inv: "invoice",
};

export interface SearchQuery {
  /** What was typed, trimmed. */
  text: string;
  /** Enough typed to search (SEARCH_MIN_CHARS). */
  ready: boolean;
  /** Folded words, each to match the start of a word ("job" and the like taken out). */
  words: string[];
  /** The query's digits when it reads as a phone number (4 or more), else null. */
  digits: string | null;
  /** "Job 1038", "quote ochoa": only that kind of record. */
  only: SearchNumberKind | null;
}

/**
 * The query as the rule reads it. "#1038" and "Job 1038" are the number 1038 (the second only
 * among jobs); "(602) 555-0142" is also the digits 6025550142.
 */
export function normalizeSearch(query: string): SearchQuery {
  const text = query.trim();
  const ready = text.replace(/\s+/g, "").length >= SEARCH_MIN_CHARS;
  let words = searchWords(text);
  let only: SearchNumberKind | null = null;
  if (words.length > 1 && KIND_WORDS[words[0]!]) {
    only = KIND_WORDS[words[0]!]!;
    words = words.slice(1);
  }
  const digitsOnly = text.replace(/\D/g, "");
  const digits = /^[\d\s().+\-#]+$/.test(text) && digitsOnly.length >= 4 ? digitsOnly : null;
  return { text, ready, words, digits, only };
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

interface Kept {
  id: string;
  deleted_at?: string | null;
}

export interface SearchCustomer extends Kept {
  name: string;
  company_name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface SearchPool extends Kept {
  customer_id?: string | null;
  address_line1: string;
  city?: string | null;
  customer_name?: string | null;
}

export interface SearchJob extends Kept {
  number?: number | null;
  type: JobType | string;
  status?: string | null;
  scheduled_start?: string | null;
  created_at?: string | null;
  customer_name?: string | null;
}

export interface SearchQuote extends Kept {
  job_id: string;
  number?: number | null;
  status: QuoteStatus | string;
  total_cents: number;
  created_at?: string | null;
  customer_name?: string | null;
}

export interface SearchInvoice extends Kept {
  job_id: string;
  number?: number | null;
  status: InvoiceStatus | string;
  total_cents: number;
  amount_paid_cents?: number | null;
  created_at?: string | null;
  customer_name?: string | null;
}

/** What to search: the website gets these from search_candidates, phones from their tables. */
export interface SearchRecords {
  customers?: SearchCustomer[];
  pools?: SearchPool[];
  jobs?: SearchJob[];
  quotes?: SearchQuote[];
  invoices?: SearchInvoice[];
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type SearchKind = "customer" | "pool" | "job" | "quote" | "invoice";
export type SearchGroupKey = "customers" | "pools" | "jobs" | "quotes" | "invoices";

/** The screen a result opens: a customer, or a job (at its quotes or its invoice). */
export interface SearchOpen {
  screen: "customer" | "job";
  id: string;
  section?: "quotes" | "invoice";
}

export interface SearchHit {
  kind: SearchKind;
  id: string;
  /** "Sam Ochoa", "Job #1038 · Leak detection", "Quote #1012 · $975.00". */
  title: string;
  /** The second line: a phone or email, or the customer. */
  detail: string | null;
  /** Trailing: a job's date, a quote's or invoice's status. */
  meta: string | null;
  open: SearchOpen | null;
}

export interface SearchGroup {
  key: SearchGroupKey;
  title: string;
  /** Every match in the group (See All shows them). */
  total: number;
  hits: SearchHit[];
  /** More matches than shown: offer See All. */
  more: boolean;
}

export interface SearchResults {
  query: SearchQuery;
  groups: SearchGroup[];
  /** Searched and found nothing (show noResultsText). */
  empty: boolean;
}

export interface SearchOptions {
  /** "Today" for job dates, as an ISO string or a Date. */
  now: Date | string;
  /** The shop's time zone. */
  timeZone: string;
  /** Rows per group (SEARCH_GROUP_LIMIT); See All passes Infinity with `group`. */
  limit?: number;
  /** One group only (See All). */
  group?: SearchGroupKey;
}

export const SEARCH_GROUP_TITLES: Record<SearchGroupKey, string> = {
  customers: "Customers",
  pools: "Pools",
  jobs: "Jobs",
  quotes: "Quotes",
  invoices: "Invoices",
};

const GROUP_ORDER: SearchGroupKey[] = ["customers", "pools", "jobs", "quotes", "invoices"];

const NUMBER_GROUP: Record<SearchNumberKind, SearchGroupKey> = {
  job: "jobs",
  quote: "quotes",
  invoice: "invoices",
};

/** Every query word starts one of the record's words (in any order). */
function wordsMatch(query: string[], record: string[]): boolean {
  return query.length > 0 && query.every((q) => record.some((w) => w.startsWith(q)));
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

/** "Oct 14", or "Oct 14, 2025" in another year, in the shop's time zone. */
export function shortDate(iso: string, now: Date, timeZone: string): string {
  const d = new Date(iso);
  const sameYear = localDate(d, timeZone).slice(0, 4) === localDate(now, timeZone).slice(0, 4);
  return dateFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
}

const numbered = (label: string, n: number | null | undefined) =>
  n != null ? `${label} #${n}` : `New ${label.toLowerCase()}`;

interface Ranked {
  hit: SearchHit;
  tier: number;
  /** Larger first. */
  recency: number;
  /** Then alphabetical. */
  sort: string;
}

/**
 * Searches the records: each group's matches ranked (an exact number first, then name and
 * word-start matches, then the most recent: jobs by scheduled date, quotes and invoices by
 * created date), at most `limit` each, in the order Customers, Pools, Jobs, Quotes, Invoices.
 * Deleted records never show. Nothing is searched until SEARCH_MIN_CHARS are typed.
 */
export function searchShop(
  input: string,
  records: SearchRecords,
  options: SearchOptions,
): SearchResults {
  const query = normalizeSearch(input);
  const now = typeof options.now === "string" ? new Date(options.now) : options.now;
  const limit = options.limit ?? SEARCH_GROUP_LIMIT;
  if (!query.ready || (query.words.length === 0 && !query.digits))
    return { query, groups: [], empty: query.ready };

  const { words, digits } = query;
  const exactNumber = words.length === 1 && /^\d+$/.test(words[0]!) ? words[0]! : null;
  const kept = <T extends Kept>(rows: T[] | undefined) => (rows ?? []).filter((r) => !r.deleted_at);
  const allowed = (key: SearchGroupKey) =>
    (!options.group || options.group === key) && (!query.only || NUMBER_GROUP[query.only] === key);

  const ranked: Record<SearchGroupKey, Ranked[]> = {
    customers: [],
    pools: [],
    jobs: [],
    quotes: [],
    invoices: [],
  };

  if (allowed("customers"))
    for (const c of kept(records.customers)) {
      const nameWords = searchWords(`${c.name} ${c.company_name ?? ""}`);
      const byName = wordsMatch(words, nameWords);
      const byEmail = !byName && wordsMatch(words, [...nameWords, ...searchWords(c.email)]);
      const phoneDigits = (c.phone ?? "").replace(/\D/g, "");
      const byPhone = !!digits && phoneDigits.length > 0 && phoneDigits.includes(digits);
      if (!byName && !byEmail && !byPhone) continue;
      ranked.customers.push({
        hit: {
          kind: "customer",
          id: c.id,
          title: c.name,
          detail: c.phone?.trim() || c.email?.trim() || null,
          meta: null,
          open: { screen: "customer", id: c.id },
        },
        tier: byName || byPhone ? 1 : 2,
        recency: 0,
        sort: foldText(c.name),
      });
    }

  if (allowed("pools"))
    for (const p of kept(records.pools)) {
      if (!wordsMatch(words, searchWords(`${p.address_line1} ${p.city ?? ""}`))) continue;
      ranked.pools.push({
        hit: {
          kind: "pool",
          id: p.id,
          title: [p.address_line1, p.city].filter((s) => s?.trim()).join(", "),
          detail: p.customer_name?.trim() || null,
          meta: null,
          open: p.customer_id ? { screen: "customer", id: p.customer_id } : null,
        },
        tier: 1,
        recency: 0,
        sort: foldText(p.address_line1),
      });
    }

  const numberedRank = (n: number | null | undefined, customer: string | null | undefined) => {
    const own = [...searchWords(customer), ...(n != null ? [String(n)] : [])];
    if (!wordsMatch(words, own)) return null;
    return exactNumber && n != null && String(n) === exactNumber ? 0 : 1;
  };

  if (allowed("jobs"))
    for (const j of kept(records.jobs)) {
      const tier = numberedRank(j.number, j.customer_name);
      if (tier == null) continue;
      const type = JOB_TYPE_LABELS[j.type as JobType] ?? "Job";
      ranked.jobs.push({
        hit: {
          kind: "job",
          id: j.id,
          title: `${numbered("Job", j.number)} · ${type}`,
          detail: j.customer_name?.trim() || null,
          meta: j.scheduled_start ? shortDate(j.scheduled_start, now, options.timeZone) : null,
          open: { screen: "job", id: j.id },
        },
        tier,
        recency: time(j.scheduled_start) || time(j.created_at),
        sort: "",
      });
    }

  if (allowed("quotes"))
    for (const q of kept(records.quotes)) {
      const tier = numberedRank(q.number, q.customer_name);
      if (tier == null) continue;
      ranked.quotes.push({
        hit: {
          kind: "quote",
          id: q.id,
          title: `${numbered("Quote", q.number)} · ${formatCents(q.total_cents)}`,
          detail: q.customer_name?.trim() || null,
          meta: QUOTE_STATUS_LABELS[q.status as QuoteStatus] ?? null,
          open: { screen: "job", id: q.job_id, section: "quotes" },
        },
        tier,
        recency: time(q.created_at),
        sort: "",
      });
    }

  if (allowed("invoices"))
    for (const i of kept(records.invoices)) {
      const tier = numberedRank(i.number, i.customer_name);
      if (tier == null) continue;
      const due = i.total_cents - (i.amount_paid_cents ?? 0);
      const open = (i.status === "sent" || i.status === "partially_paid") && due > 0;
      ranked.invoices.push({
        hit: {
          kind: "invoice",
          id: i.id,
          title: `${numbered("Invoice", i.number)} · ${formatCents(open ? due : i.total_cents)}${open ? " due" : ""}`,
          detail: i.customer_name?.trim() || null,
          meta: INVOICE_STATUS_LABELS[i.status as InvoiceStatus] ?? null,
          open: { screen: "job", id: i.job_id, section: "invoice" },
        },
        tier,
        recency: time(i.created_at),
        sort: "",
      });
    }

  const groups: SearchGroup[] = [];
  for (const key of GROUP_ORDER) {
    const rows = ranked[key].sort(
      (a, b) =>
        a.tier - b.tier ||
        b.recency - a.recency ||
        (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0) ||
        (a.hit.id < b.hit.id ? -1 : a.hit.id > b.hit.id ? 1 : 0),
    );
    if (rows.length === 0) continue;
    groups.push({
      key,
      title: SEARCH_GROUP_TITLES[key],
      total: rows.length,
      hits: rows.slice(0, limit).map((r) => r.hit),
      more: rows.length > limit,
    });
  }
  return { query, groups, empty: groups.length === 0 };
}

// ---------------------------------------------------------------------------
// Recent: the last records this person opened, on this device
// ---------------------------------------------------------------------------

export type RecentKind = "customer" | "job" | "quote" | "invoice";

export interface RecentItem {
  kind: RecentKind;
  id: string;
  title: string;
  detail: string | null;
  open: SearchOpen;
}

const RECENT_KINDS: RecentKind[] = ["customer", "job", "quote", "invoice"];

/** The list with this record first (moved up if it was there), at most RECENT_LIMIT. */
export function rememberRecent(list: readonly RecentItem[], item: RecentItem): RecentItem[] {
  return [item, ...list.filter((r) => !(r.kind === item.kind && r.id === item.id))].slice(
    0,
    RECENT_LIMIT,
  );
}

/** What a device stored, checked: anything malformed is left out. */
export function parseRecent(stored: unknown): RecentItem[] {
  if (!Array.isArray(stored)) return [];
  const out: RecentItem[] = [];
  for (const r of stored) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    const open = x.open as Record<string, unknown> | null | undefined;
    if (
      !RECENT_KINDS.includes(x.kind as RecentKind) ||
      typeof x.id !== "string" ||
      typeof x.title !== "string" ||
      !open ||
      (open.screen !== "customer" && open.screen !== "job") ||
      typeof open.id !== "string"
    )
      continue;
    out.push({
      kind: x.kind as RecentKind,
      id: x.id,
      title: x.title,
      detail: typeof x.detail === "string" ? x.detail : null,
      open: {
        screen: open.screen,
        id: open.id,
        ...(open.section === "quotes" || open.section === "invoice"
          ? { section: open.section }
          : {}),
      },
    });
    if (out.length === RECENT_LIMIT) break;
  }
  return out;
}

/** A search result as a Recent entry (pools open their customer, so they're remembered as it). */
export function recentFromHit(hit: SearchHit): RecentItem | null {
  if (!hit.open || hit.kind === "pool") return null;
  return { kind: hit.kind, id: hit.id, title: hit.title, detail: hit.detail, open: hit.open };
}
