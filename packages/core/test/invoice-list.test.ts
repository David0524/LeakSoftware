import { describe, expect, it } from "vitest";
import { INVOICE_FILTERS, INVOICE_SORTS, filterInvoices, invoiceOverdue } from "../src";

// Newest first, as the list comes from the server.
const list = [
  {
    number: 5,
    status: "draft",
    total_cents: 9000,
    amount_paid_cents: 0,
    due_date: null,
    sent_at: null,
    customer: "Cole Izhaky",
    jobNumber: 1105,
  },
  {
    number: 4,
    status: "sent",
    total_cents: 20000,
    amount_paid_cents: 0,
    due_date: "2026-10-10",
    sent_at: "2026-10-01",
    customer: "Sam Sample",
    jobNumber: 1104,
  },
  {
    number: 3,
    status: "partially_paid",
    total_cents: 50000,
    amount_paid_cents: 45000,
    due_date: "2026-10-30",
    sent_at: "2026-09-30",
    customer: "Ann Lee",
    jobNumber: 1103,
  },
  {
    number: 2,
    status: "paid",
    total_cents: 30000,
    amount_paid_cents: 30000,
    due_date: "2026-09-01",
    sent_at: "2026-08-20",
    customer: "Bo Diaz",
    jobNumber: 1102,
  },
  {
    number: 1,
    status: "void",
    total_cents: 1000,
    amount_paid_cents: 0,
    due_date: null,
    sent_at: null,
    customer: null,
    jobNumber: null,
  },
] as const;
const today = "2026-10-20";
const nums = (o: Parameters<typeof filterInvoices>[1]) =>
  filterInvoices([...list], o).map((i) => i.number);

describe("the Invoices list", () => {
  it("has filters and sorts in plain words", () => {
    expect(INVOICE_FILTERS.map((f) => f.label)).toEqual([
      "All",
      "Unpaid",
      "Overdue",
      "Drafts",
      "Paid",
      "Void",
    ]);
    expect(INVOICE_SORTS.map((s) => s.label)).toEqual([
      "Newest",
      "Oldest",
      "Due Date",
      "Amount Owed",
      "Total",
      "Customer",
    ]);
  });

  it("filters by what's owed and by status", () => {
    expect(nums({ today })).toEqual([5, 4, 3, 2, 1]);
    expect(nums({ filter: "open", today })).toEqual([4, 3]);
    expect(nums({ filter: "overdue", today })).toEqual([4]);
    expect(nums({ filter: "draft", today })).toEqual([5]);
    expect(nums({ filter: "paid", today })).toEqual([2]);
    expect(nums({ filter: "void", today })).toEqual([1]);
    expect(nums({ filter: "nonsense", today })).toEqual([5, 4, 3, 2, 1]);
    expect(invoiceOverdue(list[2], today)).toBe(false);
  });

  it("searches the customer and the invoice or job number", () => {
    expect(nums({ q: "sam", today })).toEqual([4]);
    expect(nums({ q: "#3", today })).toEqual([3]);
    expect(nums({ q: "1102", today })).toEqual([2]);
    expect(nums({ q: "nobody", today })).toEqual([]);
  });

  it("sorts", () => {
    expect(nums({ sort: "oldest", today })).toEqual([1, 2, 3, 4, 5]);
    expect(nums({ sort: "due", today })).toEqual([2, 4, 3, 5, 1]);
    expect(nums({ sort: "balance", today })).toEqual([4, 5, 3, 1, 2]);
    expect(nums({ sort: "total", today })).toEqual([3, 2, 4, 5, 1]);
    expect(nums({ sort: "customer", today })).toEqual([3, 2, 5, 4, 1]);
  });
});
