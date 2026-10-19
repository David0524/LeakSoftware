import { useMemo } from "react";
import type { Customer, Job, Property } from "@leakbook/core";
import { useRows } from "./hooks";

// Customers on the phone (spec 5.9), from synced rows: searched, filtered, and sorted as the
// website's listCustomers does.

export const CUSTOMER_SORTS = {
  name: "Name A–Z",
  name_desc: "Name Z–A",
  newest: "Newest",
  oldest: "Oldest",
  last_visit: "Last Visit",
  city: "City",
} as const;
export type CustomerSort = keyof typeof CUSTOMER_SORTS;

/** Customer kinds, plural for the Show menu. */
export const KIND_PLURALS: Record<string, string> = {
  homeowner: "Homeowners",
  pool_company: "Pool Companies",
  builder: "Builders",
  insurer: "Insurers",
  property_manager: "Property Managers",
  other: "Other",
};

/** Customer kinds, as on the customer's page. */
export const KIND_LABELS: Record<string, string> = {
  homeowner: "Homeowner",
  pool_company: "Pool company",
  builder: "Builder",
  insurer: "Insurer",
  property_manager: "Property manager",
  other: "Other",
};

export type CustomerRow = Customer & {
  company_name?: string | null;
  cc_emails?: string[] | null;
  marketing_opt_out?: boolean | null;
  notes?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
};

export interface ServicePlanRow {
  id: string;
  customer_id: string;
  property_id: string;
  assigned_user_id: string | null;
  starts_on: string;
  interval_weeks: number;
  weekdays: number[] | null;
  monthly: boolean | null;
  visit_time: string | null;
  duration_minutes: number;
  price_cents: number | null;
  ends_on: string | null;
  paused: boolean;
  deleted_at?: string | null;
}

export interface CustomerListRow extends CustomerRow {
  properties: Property[];
  hasPlan: boolean;
  lastVisit: string | null;
  city: string | null;
}

export function useCustomerData(companyId: string) {
  const customers = useRows<CustomerRow>("customer", companyId);
  const properties = useRows<Property & { deleted_at?: string | null }>("property", companyId);
  const plans = useRows<ServicePlanRow>("service_plan", companyId);
  const jobs = useRows<Job & { deleted_at?: string | null }>("job", companyId);
  return { customers, properties, plans, jobs };
}

/** The list, searched (name, phone, or email), filtered by `show`, and sorted. */
export function useCustomerList(
  companyId: string,
  search: string,
  sort: CustomerSort,
  show: string,
): CustomerListRow[] {
  const { customers, properties, plans, jobs } = useCustomerData(companyId);
  return useMemo(() => {
    const now = new Date().toISOString();
    const withPlan = new Set(plans.filter((p) => !p.deleted_at).map((p) => p.customer_id));
    const lastVisit = new Map<string, string>();
    for (const v of jobs) {
      if (v.deleted_at || v.status === "canceled" || !v.bill_to_customer_id) continue;
      if (!v.scheduled_start || v.scheduled_start > now) continue;
      const at = v.completed_at ?? v.scheduled_start;
      const had = lastVisit.get(v.bill_to_customer_id);
      if (!had || at > had) lastVisit.set(v.bill_to_customer_id, at);
    }
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, "");
    let rows: CustomerListRow[] = customers
      .filter((c) => !c.deleted_at)
      .filter(
        (c) =>
          !term ||
          c.name.toLowerCase().includes(term) ||
          (c.email ?? "").toLowerCase().includes(term) ||
          (digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits)),
      )
      .filter((c) => ["all", "plan", "no_plan"].includes(show) || c.kind === show)
      .map((c) => {
        const pools = properties.filter((p) => p.customer_id === c.id && !p.deleted_at);
        return {
          ...c,
          properties: pools,
          hasPlan: withPlan.has(c.id),
          lastVisit: lastVisit.get(c.id) ?? null,
          city: pools.find((p) => p.city)?.city ?? null,
        };
      });
    if (show === "plan") rows = rows.filter((c) => c.hasPlan);
    if (show === "no_plan") rows = rows.filter((c) => !c.hasPlan);
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    const created = (c: CustomerRow) => c.created_at ?? "";
    rows.sort((a, b) => {
      switch (sort) {
        case "name_desc":
          return byName(b, a);
        case "newest":
          return created(b).localeCompare(created(a)) || byName(a, b);
        case "oldest":
          return created(a).localeCompare(created(b)) || byName(a, b);
        case "last_visit":
          return (b.lastVisit ?? "").localeCompare(a.lastVisit ?? "") || byName(a, b);
        case "city":
          return a.city && b.city
            ? a.city.localeCompare(b.city) || byName(a, b)
            : a.city
              ? -1
              : b.city
                ? 1
                : byName(a, b);
        default:
          return byName(a, b);
      }
    });
    return rows;
  }, [customers, properties, plans, jobs, search, sort, show]);
}
