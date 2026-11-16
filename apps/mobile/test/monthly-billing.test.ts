import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalStore, type Uploader } from "@leakbook/sync";
import type { MonthBilling } from "@leakbook/core";
import { memoryDb } from "../../../packages/sync/test/sqlite";

// Monthly billing (owner, 2026-11-15; docs/design/2026-11-15-monthly-billing.md): a visit's
// charges are written on the phone first (row + outbox), as the website's and the iPhone's; Add
// Charge's fields are checked as the website's; a month's page shows the lines changed here at
// once; and a plan carries its invoice day.

vi.mock("react-native", () => ({
  AppState: { addEventListener: () => ({ remove() {} }), currentState: "active" },
}));
vi.mock("@react-native-community/netinfo", () => ({
  default: { addEventListener: () => () => {} },
}));
vi.mock("expo-file-system", () => ({ Paths: { availableDiskSpace: 1e12 } }));
vi.mock("../src/lib/media", () => ({ deleteAllMedia: () => {} }));
vi.mock("../src/lib/config", () => ({ API_URL: "https://sundeck.test" }));

const { SyncService } = await import("../src/lib/sync-service");

function service() {
  const kv = new Map<string, string>();
  return new SyncService(
    LocalStore.open(memoryDb()),
    { auth: { getSession: async () => ({ data: { session: null } }) } } as never as SupabaseClient,
    {
      get: (k) => kv.get(k) ?? null,
      set: (k, v) => void kv.set(k, v),
      remove: (k) => void kv.delete(k),
    },
    {} as Uploader,
  );
}

const sync = service();
vi.mock("../src/lib/services", () => ({ getServices: () => ({ sync }) }));
const {
  addInvoiceCharge,
  addVisitCharge,
  chargeItemsOf,
  chargesSentInvoice,
  checkCharge,
  removeInvoiceLine,
  removeVisitCharge,
} = await import("../src/data/charges");
const { validMonth, withLocalLines } = await import("../src/data/monthlyBilling");
const { checkPlan, invoiceDayOptions } = await import("../src/features/maintenance/plan");

const company = "0190b6b0-0000-7000-8000-000000000001";
const job = "0190b6b0-0000-7000-8000-000000000002";
const invoice = "0190b6b0-0000-7000-8000-000000000003";

const basket = {
  id: "0190b6b0-0000-7000-8000-000000000010",
  name: "Replace skimmer basket",
  category: "Repair",
  price_cents: 2400,
  taxable: true,
};

describe("Add Charge's fields", () => {
  it("takes a price book item and how many", () => {
    expect(checkCharge({ mode: "book", item: basket, quantity: "2" })).toEqual({
      errors: null,
      values: {
        name: "Replace skimmer basket",
        quantity: 2,
        unit_price_cents: 2400,
        taxable: true,
        price_book_item_id: basket.id,
      },
    });
  });

  it("asks for an item, and for a quantity like the website", () => {
    expect(checkCharge({ mode: "book", item: null, quantity: "1" }).errors).toEqual({
      item: "Pick an item from the price book.",
    });
    expect(checkCharge({ mode: "book", item: basket, quantity: "0" }).errors).toEqual({
      quantity: "Enter a quantity like 1 or 2.5.",
    });
    expect(checkCharge({ mode: "book", item: basket, quantity: "abc" }).errors).toEqual({
      quantity: "Enter a quantity like 1 or 2.5.",
    });
  });

  it("takes a custom description and price, blank quantity is 1", () => {
    expect(
      checkCharge({
        mode: "custom",
        description: " Clean salt cell ",
        price: "45",
        quantity: "",
        taxable: false,
      }).values,
    ).toEqual({
      name: "Clean salt cell",
      quantity: 1,
      unit_price_cents: 4500,
      taxable: false,
      price_book_item_id: null,
    });
    expect(
      checkCharge({ mode: "custom", description: "", price: "x", quantity: "1", taxable: true })
        .errors,
    ).toEqual({ description: "Describe the work.", price: "Enter a price like 24." });
  });
});

describe("the price book Add Charge offers", () => {
  it("leaves out chemicals, removed and inactive items, in book order", () => {
    const items = chargeItemsOf([
      { id: "c", name: "Liquid chlorine", category: "Chemicals", sort_order: 1 },
      { id: "t", name: "Tabs", chemical: "trichlor", sort_order: 2 },
      { id: "z", name: "Filter clean", category: "Service", sort_order: 5, price_cents: 6500 },
      { id: "a", name: "Basket", category: "Repair", sort_order: 3 },
      { id: "x", name: "Old", deleted_at: "2026-11-01T00:00:00Z" },
      { id: "i", name: "Inactive", active: false },
    ]);
    expect(items.map((i) => i.id)).toEqual(["a", "z"]);
    expect(items[1]).toEqual({
      id: "z",
      name: "Filter clean",
      category: "Service",
      price_cents: 6500,
      taxable: true,
    });
  });
});

describe("a visit's charges", () => {
  it("adds a charge on the phone (row and outbox), then removes it", () => {
    const values = checkCharge({ mode: "book", item: basket, quantity: "1" }).values!;
    const id = addVisitCharge(company, job, values);
    expect(sync.get("visit_charge", id)).toMatchObject({
      job_id: job,
      price_book_item_id: basket.id,
      name: "Replace skimmer basket",
      quantity: 1,
      unit_price_cents: 2400,
      taxable: true,
    });
    expect(sync.hasPendingWrites("visit_charge", id)).toBe(true);
    removeVisitCharge(company, id);
    expect(sync.get("visit_charge", id)?.deleted_at).toBeTruthy();
  });

  it("is locked once on a sent invoice; one not on the phone counts as sent", () => {
    const sent = { id: invoice, status: "sent", number: 1042, sent_at: "2026-11-01T15:00:00Z" };
    expect(chargesSentInvoice([{ billed_invoice_id: null }], [sent])).toBeNull();
    expect(
      chargesSentInvoice([{ billed_invoice_id: invoice }], [{ ...sent, status: "draft" }]),
    ).toBe(null);
    expect(chargesSentInvoice([{ billed_invoice_id: invoice }], [sent])).toEqual({
      number: 1042,
      sentAt: "2026-11-01T15:00:00Z",
      known: true,
    });
    expect(chargesSentInvoice([{ billed_invoice_id: invoice }], [])).toEqual({
      number: null,
      sentAt: null,
      known: false,
    });
  });
});

describe("a month's page", () => {
  const billing: MonthBilling = {
    month: "2026-10-01",
    not_invoiced: 0,
    waiting: [],
    invoices: [
      {
        id: invoice,
        number: null,
        status: "draft",
        job_id: job,
        customer_id: "c",
        customer: "Jane Doe",
        email: "jane@example.com",
        phone: null,
        total_cents: 16400,
        amount_paid_cents: 0,
        sent_at: null,
        due_date: null,
        lines: [
          {
            id: "server-line",
            description: "Pool service, October",
            quantity: 1,
            unit_price_cents: 16400,
            kind: "item",
            taxable: false,
          },
        ],
      },
    ],
  };

  it("keeps the server's lines while the draft isn't on the phone", () => {
    expect(withLocalLines(billing, [], [], 0)).toEqual(billing);
  });

  it("shows a charge added here at once, at the end, with the total", () => {
    sync.write("invoice", invoice, company, { status: "draft", discount_cents: 0 });
    sync.write("invoice_line_item", "0190b6b0-0000-7000-8000-000000000020", company, {
      invoice_id: invoice,
      kind: "item",
      description: "Pool service, October",
      quantity: 1,
      unit_price_cents: 16400,
      taxable: false,
      sort_order: 1,
    });
    const values = checkCharge({ mode: "book", item: basket, quantity: "2" }).values!;
    const id = addInvoiceCharge(company, invoice, values);
    expect(sync.get("invoice_line_item", id)).toMatchObject({
      invoice_id: invoice,
      kind: "item",
      description: "Replace skimmer basket",
      quantity: 2,
      unit_price_cents: 2400,
      sort_order: 2,
    });
    const shown = () =>
      withLocalLines(
        billing,
        sync.list("invoice", company) as never,
        sync.list("invoice_line_item", company) as never,
        0,
      ).invoices[0]!;
    expect(shown().lines.map((l) => l.description)).toEqual([
      "Pool service, October",
      "Replace skimmer basket",
    ]);
    expect(shown().total_cents).toBe(16400 + 4800);

    removeInvoiceLine(company, id);
    expect(shown().lines).toHaveLength(1);
    expect(shown().total_cents).toBe(16400);
  });

  it("takes only a month's first day", () => {
    expect(validMonth("2026-10-01")).toBe("2026-10-01");
    expect(validMonth("2026-10-02")).toBeNull();
    expect(validMonth("2026-13-01")).toBeNull();
    expect(validMonth(undefined)).toBeNull();
  });
});

describe("a plan's invoice day", () => {
  const plan = {
    repeat: "weekly" as const,
    days: [],
    startsOn: "2026-11-16",
    time: "",
    minutes: "30",
    price: "180",
    endsOn: "",
    tech: "",
    notes: "",
  };

  it("is the shop's default when not chosen, else the day", () => {
    expect(checkPlan(plan).values?.invoice_day).toBeNull();
    expect(checkPlan({ ...plan, invoiceDay: "" }).values?.invoice_day).toBeNull();
    expect(checkPlan({ ...plan, invoiceDay: "15" }).values?.invoice_day).toBe(15);
    expect(checkPlan({ ...plan, invoiceDay: "31" }).values?.invoice_day).toBeNull();
  });

  it("offers Shop Default, then the 1st to the 28th", () => {
    const options = invoiceDayOptions(15);
    expect(options[0]).toEqual({ value: "", label: "Shop Default (15th)" });
    expect(options.slice(1, 4).map((o) => o.label)).toEqual(["1st", "2nd", "3rd"]);
    expect(options.at(-1)).toEqual({ value: "28", label: "28th" });
    expect(options).toHaveLength(29);
  });
});
