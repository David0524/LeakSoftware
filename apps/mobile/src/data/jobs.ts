import { useMemo } from "react";
import {
  inRouteOrder,
  lockReason,
  type Customer,
  type Job,
  type LockReason,
  type Property,
} from "@leakbook/core";
import { lockTag } from "../lib/dayMap";
import { useRows } from "./hooks";

export interface JobView extends Job {
  property?: Property;
  customer?: Customer;
}

/** Jobs of a company joined with their property and customer. */
export function useJobViews(companyId: string): JobView[] {
  const jobs = useRows<Job>("job", companyId);
  const properties = useRows<Property>("property", companyId);
  const customers = useRows<Customer>("customer", companyId);
  return useMemo(() => {
    const p = new Map(properties.map((x) => [x.id, x]));
    const c = new Map(customers.map((x) => [x.id, x]));
    return jobs.map((j) => {
      const property = p.get(j.property_id);
      return {
        ...j,
        property,
        customer: c.get(j.bill_to_customer_id ?? property?.customer_id ?? ""),
      };
    });
  }, [jobs, properties, customers]);
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

/** What a stop's card says keeps it in place ("Day locked", "Two techs"), if anything. */
export function stopLockTag(job: JobView): { label: string; icon: boolean } | null {
  return lockTag({ ...job, property: job.property ?? null });
}
