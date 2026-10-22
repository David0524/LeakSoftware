import {
  countCustomers,
  customerShowOptions,
  customersAddedNote,
  customersAddedSince,
  customersOnPlan,
  formatCount,
  onPlanShareNote,
  planIsCurrent,
  type CustomerCounts,
  type CustomerForCount,
  type PlanForCount,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// customer-counts.ts (owner, 2026-10-22): the Customers Show menu's counts and the Dashboard's
// customer trackers.

const TODAY = "2026-10-22";
const plans: PlanForCount[] = [
  { customer_id: "a", ends_on: null },
  { customer_id: "a", ends_on: "2026-12-31" },
  { customer_id: "b", ends_on: "2026-10-22" },
  { customer_id: "c", ends_on: "2026-10-21" },
  { customer_id: "d", ends_on: null, deleted_at: "2026-10-01T00:00:00Z" },
  { customer_id: "e", ends_on: "" },
];
const customers: CustomerForCount[] = [
  { id: "a", kind: "homeowner", created_at: "2026-10-20 10:00:00+00" },
  { id: "b", kind: "builder", created_at: "2026-09-22T17:00:00.000Z" },
  { id: "c", kind: "homeowner", created_at: "2026-09-22T16:59:59+00:00" },
  { id: "d", kind: null, created_at: null },
  { id: "e", kind: "insurer", deleted_at: "2026-10-02T00:00:00Z" },
  { id: "f", kind: "property_manager", created_at: "2026-10-22T16:00:00.123456+00:00" },
];
const counts: CustomerCounts = {
  all: 1204,
  plan: 65,
  no_plan: 1139,
  kinds: { homeowner: 1100, builder: 4 },
  added: 4,
};

export const customerCounts: ModuleCases = {
  planIsCurrent: rule(
    (plan: PlanForCount, today: string) => planIsCurrent(plan, today),
    plans.map((p) => [p, TODAY] as [PlanForCount, string]),
  ),
  customersOnPlan: rule(
    (p: PlanForCount[], today: string) => customersOnPlan(p, today),
    [
      [plans, TODAY],
      [plans, "2026-10-23"],
      [[], TODAY],
    ],
  ),
  customersAddedSince: rule(
    (now: string) => customersAddedSince(new Date(now)),
    [["2026-10-22T17:00:00Z"], ["2026-03-10T08:30:15.250Z"]],
  ),
  countCustomers: rule(
    (c: CustomerForCount[], onPlan: string[], since: string) => countCustomers(c, onPlan, since),
    [
      [customers, ["a", "b", "e"], "2026-09-22T17:00:00.000Z"],
      [customers, [], "2026-10-21T00:00:00Z"],
      [[], ["a"], "2026-09-22T17:00:00Z"],
    ],
  ),
  customerShowOptions: rule(
    (offersPool: boolean, c: CustomerCounts | null) => customerShowOptions(offersPool, c),
    [
      [true, counts],
      [false, counts],
      [true, null],
      [false, null],
    ],
  ),
  formatCount: rule((n: number) => formatCount(n), [[0], [7], [999], [1000], [1204], [1234567]]),
  customersAddedNote: rule((n: number) => customersAddedNote(n), [[0], [1], [4], [1500]]),
  onPlanShareNote: rule(
    (plan: number, all: number) => onPlanShareNote(plan, all),
    [
      [65, 125],
      [0, 0],
      [0, 12],
      [1, 3],
      [2, 3],
      [1, 8],
    ],
  ),
};
