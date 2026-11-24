import { useMemo } from "react";
import {
  inRouteOrder,
  isQuoteJob,
  lockReason,
  type Customer,
  type Job,
  type LockReason,
  type Property,
} from "@leakbook/core";
import { lockTag, type LockTagKind } from "../lib/dayMap";
import { useRows } from "./hooks";

export interface JobView extends Job {
  property?: Property;
  customer?: Customer;
}

/**
 * Jobs of a company joined with their property and customer. A standalone quote's job (status
 * quote, docs/design/2026-11-24-standalone-quotes.md) isn't a job yet: every job list leaves it
 * out, so it's left out here unless `quotes` asks for it (the Quotes list and Quote screen).
 * A quote job may have no pool: its `property` is undefined.
 */
export function useJobViews(companyId: string, opts: { quotes?: boolean } = {}): JobView[] {
  const jobs = useRows<Job>("job", companyId);
  const properties = useRows<Property>("property", companyId);
  const customers = useRows<Customer>("customer", companyId);
  const quotes = opts.quotes ?? false;
  return useMemo(
    () => jobViews(jobs, properties, customers, { quotes }),
    [jobs, properties, customers, quotes],
  );
}

/** useJobViews without React, for tests. */
export function jobViews(
  jobs: Job[],
  properties: Property[],
  customers: Customer[],
  opts: { quotes?: boolean } = {},
): JobView[] {
  const p = new Map(properties.map((x) => [x.id, x]));
  const c = new Map(customers.map((x) => [x.id, x]));
  return jobs
    .filter((j) => opts.quotes || !isQuoteJob(j))
    .map((j) => {
      const property = j.property_id ? p.get(j.property_id) : undefined;
      return {
        ...j,
        property,
        customer: c.get(j.bill_to_customer_id ?? property?.customer_id ?? ""),
      };
    });
}

/** A day's jobs in route order (the shared routing rules: time, then saved order). */
export function inRouteOrderViews(jobs: JobView[]): JobView[] {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  return inRouteOrder(jobs.map((j) => ({ ...j, property: j.property ?? null }))).map((j) =>
    byId.get(j.id)!,
  );
}

/**
 * Why planning keeps a stop's time ("started", a lock, "two_techs"), if it does. Named apart
 * from core's jobLock, which says which lock a job has (none, day, time, both).
 */
export function stopLockReason(job: JobView): LockReason | null {
  return lockReason({ ...job, property: job.property ?? null });
}

/** What keeps a stop in place (a lock icon, or "Two techs"), if anything. */
export function stopLockTag(job: JobView): { label: string; kind: LockTagKind } | null {
  return lockTag({ ...job, property: job.property ?? null });
}
