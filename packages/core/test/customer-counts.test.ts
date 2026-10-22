import { describe, expect, it } from "vitest";
import {
  countCustomers,
  customerShowOptions,
  customersAddedNote,
  customersAddedSince,
  customersOnPlan,
  formatCount,
  onPlanShareNote,
  planIsCurrent,
} from "../src";

describe("customer counts", () => {
  const today = "2026-10-22";
  const plans = [
    { customer_id: "a", ends_on: null },
    { customer_id: "a", ends_on: "2026-12-31" },
    { customer_id: "b", ends_on: "2026-10-22" },
    { customer_id: "c", ends_on: "2026-10-21" },
    { customer_id: "d", ends_on: null, deleted_at: "2026-10-01T00:00:00Z" },
  ];
  const customers = [
    { id: "a", kind: "homeowner", created_at: "2026-10-20 10:00:00+00" },
    { id: "b", kind: "builder", created_at: "2026-09-22T17:00:00.000Z" },
    { id: "c", kind: "homeowner", created_at: "2026-09-22T16:59:59+00:00" },
    { id: "d", kind: null, created_at: null },
    { id: "e", kind: "insurer", deleted_at: "2026-10-02T00:00:00Z" },
  ];

  it("counts a plan until its end date, paused or not", () => {
    expect(planIsCurrent({ customer_id: "x", ends_on: today }, today)).toBe(true);
    expect(planIsCurrent({ customer_id: "x", ends_on: "2026-10-21" }, today)).toBe(false);
    expect(customersOnPlan(plans, today)).toEqual(["a", "b"]);
  });

  it("counts each choice and the customers added in 30 days", () => {
    const since = customersAddedSince(new Date("2026-10-22T17:00:00Z"));
    expect(since).toBe("2026-09-22T17:00:00.000Z");
    expect(countCustomers(customers, customersOnPlan(plans, today), since)).toEqual({
      all: 4,
      plan: 2,
      no_plan: 2,
      kinds: { homeowner: 3, builder: 1 },
      added: 2,
    });
  });

  it("puts the count in each Show label", () => {
    const counts = countCustomers(customers, ["a", "b"], "2026-09-22T17:00:00Z");
    expect(customerShowOptions(true, counts).map((o) => o.label)).toEqual([
      "All Customers (4)",
      "On a Plan (2)",
      "No Plan (2)",
      "Homeowners (3)",
      "Pool Companies (0)",
      "Builders (1)",
      "Insurers (0)",
      "Property Managers (0)",
      "Other (0)",
    ]);
    expect(
      customerShowOptions(false)
        .map((o) => o.value)
        .slice(0, 2),
    ).toEqual(["all", "homeowner"]);
    expect(formatCount(1204)).toBe("1,204");
  });

  it("words the Dashboard notes", () => {
    expect(customersAddedNote(4)).toBe("+4 in 30 days");
    expect(customersAddedNote(0)).toBe("None new in 30 days");
    expect(onPlanShareNote(65, 125)).toBe("52% of customers");
    expect(onPlanShareNote(0, 0)).toBe("No customers yet");
  });
});
