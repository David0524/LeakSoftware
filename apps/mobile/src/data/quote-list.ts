import { useMemo } from "react";
import {
  isQuoteJob,
  newQuoteRecords,
  type Customer,
  type Job,
  type NewQuoteInput,
  type Property,
  type Quote,
  type QuoteListItem,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import type { SyncService } from "../lib/sync-service";
import { useRows } from "./hooks";

// Standalone quotes and the Quotes list (owner, 2026-11-24; docs/design/2026-11-24-standalone-
// quotes.md), from this phone's rows. A standalone quote is a quote job (a repair job with
// status quote, the pool optional) plus its quote. The words and list rules are core's
// quote-list.ts; this file joins the rows and writes New Quote, Add Pool and Delete Quote
// through the sync layer.

type Kept = { deleted_at?: string | null };

export interface QuoteListRow extends QuoteListItem {
  id: string;
  job_id: string;
  created_at: string | null;
}

/**
 * Every quote in the shop, standalone and on jobs, newest first, with its customer (the job's
 * bill-to customer, else the pool's owner) and its job's status and number. Quotes of a deleted
 * or missing job are left out.
 */
export function quoteListRows(
  quotes: (Quote & { created_at?: string | null })[],
  jobs: (Job & Kept)[],
  properties: Property[],
  customers: Customer[],
): QuoteListRow[] {
  const jobById = new Map(jobs.filter((j) => !j.deleted_at).map((j) => [j.id, j]));
  const poolById = new Map(properties.map((p) => [p.id, p]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  return quotes
    .filter((q) => !q.deleted_at && jobById.has(q.job_id))
    .map((q) => {
      const job = jobById.get(q.job_id)!;
      const owner = job.property_id ? poolById.get(job.property_id)?.customer_id : undefined;
      const customer = customerById.get(job.bill_to_customer_id ?? owner ?? "");
      return {
        id: q.id,
        job_id: q.job_id,
        number: q.number ?? null,
        status: q.status,
        total_cents: q.total_cents ?? 0,
        customer: customer?.name ?? null,
        jobStatus: job.status,
        jobNumber: job.number ?? null,
        created_at: q.created_at ?? null,
      };
    })
    .sort(
      (a, b) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? "") ||
        (b.number ?? Infinity) - (a.number ?? Infinity) ||
        b.id.localeCompare(a.id),
    );
}

export function useQuoteList(companyId: string): QuoteListRow[] {
  const quotes = useRows<Quote & { created_at?: string | null }>("quote", companyId);
  const jobs = useRows<Job & Kept>("job", companyId);
  const properties = useRows<Property>("property", companyId);
  const customers = useRows<Customer>("customer", companyId);
  return useMemo(
    () => quoteListRows(quotes, jobs, properties, customers),
    [quotes, jobs, properties, customers],
  );
}

/**
 * New Quote: the customer and pool when new, the quote job and its empty quote, in one batch
 * (all or nothing). Returns the new quote's id, and the new pool's (to find on the map).
 */
export function createQuote(
  sync: Pick<SyncService, "batch" | "insert">,
  companyId: string,
  input: NewQuoteInput,
  assignedUserId: string | null,
): { quoteId: string; jobId: string; newPool: string | null } {
  const records = newQuoteRecords(input, assignedUserId);
  return sync.batch(() => {
    const customer = input.customerId ?? sync.insert("customer", companyId, records.customer!);
    const newPool = records.property
      ? sync.insert("property", companyId, { ...records.property, customer_id: customer })
      : null;
    const jobId = sync.insert("job", companyId, {
      ...records.job,
      property_id: input.propertyId ?? newPool,
      bill_to_customer_id: customer,
    });
    const quoteId = sync.insert("quote", companyId, { ...records.quote, job_id: jobId });
    return { quoteId, jobId, newPool };
  });
}

export interface NewPoolAddress {
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
}

/**
 * Add Pool on a quote job with none: one of the customer's pools, or a new address for them.
 * Setting the job's pool is all it takes; the server makes an accepted quote's job the repair
 * job then. Returns the new pool's id, if one was made.
 */
export function setQuotePool(
  sync: Pick<SyncService, "batch" | "insert" | "write">,
  companyId: string,
  job: { id: string; bill_to_customer_id?: string | null },
  pool: { propertyId: string } | NewPoolAddress,
): string | null {
  return sync.batch(() => {
    if ("propertyId" in pool) {
      sync.write("job", job.id, companyId, { property_id: pool.propertyId });
      return null;
    }
    const blankToNull = (s: string) => s.trim() || null;
    const newPool = sync.insert("property", companyId, {
      customer_id: job.bill_to_customer_id ?? null,
      address_line1: pool.addressLine1.trim(),
      city: blankToNull(pool.city),
      state: blankToNull(pool.state)?.toUpperCase() ?? null,
      postal_code: blankToNull(pool.postalCode),
      has_pool: true,
    } as Record<string, JsonValue>);
    sync.write("job", job.id, companyId, { property_id: newPool });
    return newPool;
  });
}

/** Whether the Quote screen offers Delete Quote: a draft standalone quote. */
export function canDeleteQuote(quote: Pick<Quote, "status">, job: Pick<Job, "status">): boolean {
  return quote.status === "draft" && isQuoteJob(job);
}

/** Delete Quote: the quote and its quote job, soft-deleted together. */
export function deleteStandaloneQuote(
  sync: Pick<SyncService, "batch" | "write">,
  companyId: string,
  quote: { id: string },
  job: { id: string },
) {
  const at = new Date().toISOString();
  sync.batch(() => {
    sync.write("quote", quote.id, companyId, { deleted_at: at });
    sync.write("job", job.id, companyId, { deleted_at: at });
  });
}
