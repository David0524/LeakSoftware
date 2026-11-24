import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalStore, type Uploader } from "@leakbook/sync";
import {
  filterQuotes,
  quoteWaitingForPool,
  type Customer,
  type Job,
  type Property,
  type Quote,
} from "@leakbook/core";
import { memoryDb } from "../../../packages/sync/test/sqlite";

// Standalone quotes on the phone (docs/design/2026-11-24-standalone-quotes.md): New Quote
// writes the customer, pool, quote job and quote in one batch through the sync layer; the
// Quotes list joins every quote with its customer; and a quote job never shows in a job list.

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
const store = LocalStore.open(memoryDb());
const kv = new Map<string, string>();
const sync = new SyncService(
  store,
  { auth: { getSession: async () => ({ data: { session: null } }) } } as never as SupabaseClient,
  {
    get: (k) => kv.get(k) ?? null,
    set: (k, v) => void kv.set(k, v),
    remove: (k) => void kv.delete(k),
  },
  {} as Uploader,
);
vi.mock("../src/lib/services", () => ({ getServices: () => ({ sync }) }));

const { canDeleteQuote, createQuote, deleteStandaloneQuote, quoteListRows, setQuotePool } =
  await import("../src/data/quote-list");
const { jobViews } = await import("../src/data/jobs");
const { needsATime, routesFor } = await import("../src/data/schedule");
const { searchRecords } = await import("../src/lib/shopSearch");

const company = "0190b6b0-0000-7000-8000-000000000001";
const blank = {
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  addressLine1: "",
  city: "",
  state: "",
  postalCode: "",
};

const outbox = () =>
  store.database.all<{ table_name: string; row_id: string; fields: string }>(
    "select table_name, row_id, fields from sync_outbox order by seq",
  );
const clearOutbox = () => store.database.run("delete from sync_outbox");

describe("New Quote", () => {
  it("writes a new customer, pool, quote job and quote together, in order", () => {
    clearOutbox();
    const made = createQuote(
      sync,
      company,
      {
        ...blank,
        customerName: " Sam Ochoa ",
        customerPhone: "702 555 0100",
        addressLine1: "12 Palm Way",
        city: "Henderson",
        state: "nv",
      },
      "tech-1",
    );
    const rows = outbox();
    expect(rows.map((r) => r.table_name)).toEqual(["customer", "property", "job", "quote"]);
    const job = sync.get("job", made.jobId)!;
    const customerId = rows[0]!.row_id;
    expect(job).toMatchObject({
      type: "repair",
      status: "quote",
      property_id: made.newPool,
      bill_to_customer_id: customerId,
      assigned_user_id: "tech-1",
    });
    expect(sync.get("property", made.newPool!)).toMatchObject({
      customer_id: customerId,
      address_line1: "12 Palm Way",
      state: "NV",
    });
    expect(sync.get("quote", made.quoteId)).toMatchObject({
      job_id: made.jobId,
      discount_cents: 0,
    });
    expect(sync.get("customer", customerId)).toMatchObject({ name: "Sam Ochoa" });
  });

  it("for an existing customer with no pool, writes only the quote job and quote", () => {
    clearOutbox();
    const customer = sync.insert("customer", company, { kind: "homeowner", name: "Ana Ruiz" });
    clearOutbox();
    const made = createQuote(sync, company, { ...blank, customerId: customer }, null);
    expect(outbox().map((r) => r.table_name)).toEqual(["job", "quote"]);
    expect(made.newPool).toBeNull();
    expect(sync.get("job", made.jobId)).toMatchObject({
      property_id: null,
      bill_to_customer_id: customer,
      assigned_user_id: null,
      status: "quote",
    });
  });

  it("Add Pool sets the quote job's pool, picked or new", () => {
    const customer = sync.insert("customer", company, { kind: "homeowner", name: "Lee Park" });
    const pool = sync.insert("property", company, {
      customer_id: customer,
      address_line1: "1 Elm St",
      has_pool: true,
    });
    const a = createQuote(sync, company, { ...blank, customerId: customer }, null);
    const job = { id: a.jobId, bill_to_customer_id: customer };
    expect(setQuotePool(sync, company, job, { propertyId: pool })).toBeNull();
    expect(sync.get("job", a.jobId)).toMatchObject({ property_id: pool });

    const b = createQuote(sync, company, { ...blank, customerId: customer }, null);
    const added = setQuotePool(
      sync,
      company,
      { id: b.jobId, bill_to_customer_id: customer },
      { addressLine1: " 9 Oak Ave ", city: "", state: "az", postalCode: "" },
    );
    expect(sync.get("property", added!)).toMatchObject({
      customer_id: customer,
      address_line1: "9 Oak Ave",
      city: null,
      state: "AZ",
    });
    expect(sync.get("job", b.jobId)).toMatchObject({ property_id: added });
  });

  it("Delete Quote is for a draft standalone quote, and removes the quote and its job", () => {
    expect(canDeleteQuote({ status: "draft" }, { status: "quote" })).toBe(true);
    expect(canDeleteQuote({ status: "sent" }, { status: "quote" })).toBe(false);
    expect(canDeleteQuote({ status: "draft" }, { status: "report_sent" })).toBe(false);
    const made = createQuote(sync, company, { ...blank, customerName: "Del Me" }, null);
    deleteStandaloneQuote(sync, company, { id: made.quoteId }, { id: made.jobId });
    expect(sync.list("quote", company).some((q) => q.id === made.quoteId)).toBe(false);
    expect(sync.list("job", company).some((j) => j.id === made.jobId)).toBe(false);
  });
});

const customer = (id: string, name: string) => ({ id, name }) as Customer;
const pool = (id: string, customer_id: string) =>
  ({ id, customer_id, address_line1: "1 Main" }) as Property;
const job = (id: string, values: Partial<Job> & { deleted_at?: string | null }) =>
  ({ id, type: "repair", status: "quote", property_id: null, ...values }) as unknown as Job;
const quote = (id: string, job_id: string, values: Partial<Quote> & { created_at?: string }) =>
  ({ id, job_id, status: "draft", total_cents: 0, ...values }) as Quote & { created_at?: string };

describe("the Quotes list", () => {
  const customers = [customer("c1", "Sam Ochoa"), customer("c2", "Ana Ruiz")];
  const properties = [pool("p2", "c2")];
  const jobs = [
    job("j1", { bill_to_customer_id: "c1" }),
    job("j2", { status: "report_sent", number: 1050, property_id: "p2" }),
    job("j3", { bill_to_customer_id: "c1", deleted_at: "2026-11-01T00:00:00Z" }),
  ];
  const rows = quoteListRows(
    [
      quote("q1", "j1", {
        status: "accepted",
        number: 1043,
        total_cents: 125000,
        created_at: "2026-11-02",
      }),
      quote("q2", "j2", { status: "sent", number: 1044, created_at: "2026-11-03" }),
      quote("q3", "j3", { created_at: "2026-11-04" }),
      quote("q4", "j1", { created_at: "2026-11-05", deleted_at: "2026-11-06" }),
      quote("q5", "missing", { created_at: "2026-11-07" }),
    ],
    jobs,
    properties,
    customers,
  );

  it("lists every live quote, newest first, with its customer and job", () => {
    expect(rows.map((r) => r.id)).toEqual(["q2", "q1"]);
    expect(rows[0]).toMatchObject({
      customer: "Ana Ruiz",
      jobStatus: "report_sent",
      jobNumber: 1050,
    });
    expect(rows[1]).toMatchObject({ customer: "Sam Ochoa", jobStatus: "quote", jobNumber: null });
  });

  it("says when an accepted standalone quote waits for a pool, and searches", () => {
    expect(quoteWaitingForPool(rows[1]!)).toBe(true);
    expect(quoteWaitingForPool(rows[0]!)).toBe(false);
    expect(filterQuotes(rows, {}).map((r) => r.id)).toEqual(["q2"]);
    expect(filterQuotes(rows, { segment: "accepted", q: "ochoa" }).map((r) => r.id)).toEqual([
      "q1",
    ]);
    expect(filterQuotes(rows, { segment: "sent", q: "#1050" }).map((r) => r.id)).toEqual(["q2"]);
  });
});

describe("a quote job is not a job", () => {
  const customers = [customer("c1", "Sam Ochoa")];
  const jobs = [
    job("quote-job", {
      bill_to_customer_id: "c1",
      // Even a stray time must not put it on a route.
      scheduled_start: "2026-11-24T17:00:00Z",
      assigned_user_id: "tech-1",
    }),
    job("waiting", { status: "unscheduled", property_id: "p1", created_at: "2026-11-01" } as never),
  ];

  it("is left out of job views unless asked, without a pool to join", () => {
    expect(jobViews(jobs, [], customers).map((j) => j.id)).toEqual(["waiting"]);
    const all = jobViews(jobs, [], customers, { quotes: true });
    expect(all.map((j) => j.id)).toEqual(["quote-job", "waiting"]);
    expect(all[0]).toMatchObject({ property: undefined, customer: { name: "Sam Ochoa" } });
  });

  it("is never in Needs a Time or on a route", () => {
    const views = jobViews(jobs, [], customers, { quotes: true });
    expect(needsATime(views, "2026-11-24", "UTC").map((j) => j.id)).toEqual(["waiting"]);
    const { routes, unassigned } = routesFor(views, ["2026-11-24"], "UTC");
    expect(routes.size + unassigned.size).toBe(0);
  });

  it("is not in search's Jobs, while its quote is in Quotes", () => {
    const records = searchRecords({
      customers: [{ id: "c1", name: "Sam Ochoa" }],
      properties: [],
      jobs: [
        { id: "quote-job", status: "quote", bill_to_customer_id: "c1" },
        { id: "j2", status: "unscheduled", number: 1050, bill_to_customer_id: "c1" },
      ],
      quotes: [{ id: "q1", job_id: "quote-job", number: 1043, status: "draft" }],
      invoices: [],
    });
    expect(records.jobs?.map((j) => j.id)).toEqual(["j2"]);
    expect(records.quotes?.map((q) => q.id)).toEqual(["q1"]);
    expect(records.quotes?.[0]).toMatchObject({ customer_name: "Sam Ochoa" });
  });
});
