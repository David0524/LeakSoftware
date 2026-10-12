import { useMemo } from "react";
import type { Customer, Job, Property } from "@leakbook/core";
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
