import { describe, expect, it } from "vitest";
import {
  RECENT_LIMIT,
  noResultsText,
  normalizeSearch,
  parseRecent,
  recentFromHit,
  rememberRecent,
  searchShop,
  type RecentItem,
  type SearchRecords,
} from "../src";

const at = { now: "2026-10-20T16:00:00Z", timeZone: "America/Phoenix" };

const records: SearchRecords = {
  customers: [
    { id: "c1", name: "Sam Ochoa", phone: "(602) 555-0142", email: "sam@example.com" },
    { id: "c2", name: "José Núñez", email: "jose@example.com" },
    { id: "c3", name: "Hoang Tran" },
    { id: "c4", name: "Sam Gone", deleted_at: "2026-10-01T00:00:00Z" },
    { id: "c5", name: "Lee Park", email: "ochoa.fan@example.com" },
  ],
  pools: [
    {
      id: "p1",
      customer_id: "c1",
      address_line1: "1038 Palm Lane",
      city: "Mesa",
      customer_name: "Sam Ochoa",
    },
  ],
  jobs: [
    {
      id: "j1",
      number: 1038,
      type: "detection",
      scheduled_start: "2026-10-14T16:30:00Z",
      customer_name: "Sam Ochoa",
    },
    {
      id: "j2",
      number: 10380,
      type: "repair",
      scheduled_start: "2026-10-30T16:30:00Z",
      customer_name: "Lee Park",
    },
    {
      id: "j3",
      number: 1039,
      type: "maintenance",
      scheduled_start: null,
      created_at: "2025-01-01T00:00:00Z",
      customer_name: "Sam Ochoa",
    },
    {
      id: "j4",
      number: 1040,
      type: "detection",
      customer_name: "Sam Ochoa",
      deleted_at: "2026-10-02T00:00:00Z",
    },
  ],
  quotes: [
    {
      id: "q1",
      job_id: "j1",
      number: 1012,
      status: "sent",
      total_cents: 97500,
      customer_name: "Sam Ochoa",
    },
  ],
  invoices: [
    {
      id: "i1",
      job_id: "j1",
      number: 1028,
      status: "partially_paid",
      total_cents: 50000,
      amount_paid_cents: 12500,
      customer_name: "Sam Ochoa",
    },
    {
      id: "i2",
      job_id: "j3",
      number: 1029,
      status: "paid",
      total_cents: 37500,
      amount_paid_cents: 37500,
      customer_name: "Sam Ochoa",
    },
  ],
};

const titles = (q: string, opts = {}) =>
  searchShop(q, records, { ...at, ...opts }).groups.map((g) => [
    g.title,
    g.hits.map((h) => h.title),
  ]);

describe("normalizeSearch", () => {
  it("reads numbers, kinds, and phones", () => {
    expect(normalizeSearch("#1038")).toMatchObject({ words: ["1038"], only: null, digits: "1038" });
    expect(normalizeSearch("Job 1038")).toMatchObject({
      words: ["1038"],
      only: "job",
      digits: null,
    });
    expect(normalizeSearch("(602) 555-0142").digits).toBe("6025550142");
    expect(normalizeSearch("555").digits).toBeNull();
    expect(normalizeSearch("o").ready).toBe(false);
    expect(normalizeSearch(" o ").ready).toBe(false);
    expect(normalizeSearch("Ñu").words).toEqual(["nu"]);
  });
});

describe("searchShop", () => {
  it("waits for two characters", () => {
    expect(searchShop("s", records, at)).toMatchObject({ groups: [], empty: false });
  });

  it("matches word starts in any order, without accents or case", () => {
    expect(titles("och")[0]).toEqual(["Customers", ["Sam Ochoa", "Lee Park"]]);
    expect(titles("hoa")).toEqual([["Customers", ["Hoang Tran"]]]);
    expect(titles("ochoa sam")[0]).toEqual(["Customers", ["Sam Ochoa"]]);
    expect(titles("JOSE nun")).toEqual([["Customers", ["José Núñez"]]]);
  });

  it("never shows deleted records", () => {
    expect(titles("gone")).toEqual([]);
    expect(titles("1040")).toEqual([]);
  });

  it("finds a phone by its digits, however it is written", () => {
    expect(titles("602.555.0142")).toEqual([["Customers", ["Sam Ochoa"]]]);
    expect(titles("0142")[0]).toEqual(["Customers", ["Sam Ochoa"]]);
  });

  it("puts the exact number first, then prefixes, newest first", () => {
    expect(titles("1038")).toEqual([
      ["Pools", ["1038 Palm Lane, Mesa"]],
      ["Jobs", ["Job #1038 · Leak detection", "Job #10380 · Repair"]],
    ]);
    expect(titles("#103")).toContainEqual([
      "Jobs",
      ["Job #10380 · Repair", "Job #1038 · Leak detection", "Job #1039 · Maintenance"],
    ]);
    expect(titles("Job 1038")).toEqual([
      ["Jobs", ["Job #1038 · Leak detection", "Job #10380 · Repair"]],
    ]);
  });

  it("groups in order with the row words", () => {
    const r = searchShop("ochoa", records, at);
    // Pools match on their street and city, not their customer.
    expect(r.groups.map((g) => g.key)).toEqual(["customers", "jobs", "quotes", "invoices"]);
    const [customers, jobs, quotes, invoices] = r.groups;
    expect(customers!.hits[0]).toMatchObject({
      detail: "(602) 555-0142",
      open: { screen: "customer", id: "c1" },
    });
    expect(jobs!.hits[0]).toMatchObject({ detail: "Sam Ochoa", meta: "Oct 14" });
    expect(jobs!.hits[1]).toMatchObject({ meta: null });
    expect(quotes!.hits[0]).toMatchObject({
      title: "Quote #1012 · $975.00",
      meta: "Sent",
      open: { screen: "job", id: "j1", section: "quotes" },
    });
    expect(invoices!.hits.map((h) => h.title)).toEqual([
      "Invoice #1028 · $375.00 due",
      "Invoice #1029 · $375.00",
    ]);
  });

  it("caps each group, with See All for the rest", () => {
    const many: SearchRecords = {
      customers: Array.from({ length: 7 }, (_, i) => ({ id: `x${i}`, name: `Smith ${i}` })),
    };
    const r = searchShop("smith", many, at);
    expect(r.groups[0]).toMatchObject({ total: 7, more: true });
    expect(r.groups[0]!.hits).toHaveLength(5);
    const all = searchShop("smith", many, { ...at, group: "customers", limit: Infinity });
    expect(all.groups[0]!.hits).toHaveLength(7);
  });

  it("says when nothing matched", () => {
    expect(searchShop("zzz", records, at).empty).toBe(true);
    expect(noResultsText(" zzz ")).toEqual({
      title: "No results for “zzz”.",
      hint: "Check the spelling, or try a phone number or address.",
    });
  });
});

describe("Recent", () => {
  const item = (id: string): RecentItem => ({
    kind: "job",
    id,
    title: `Job ${id}`,
    detail: null,
    open: { screen: "job", id },
  });

  it("keeps the last 8, newest first, each once", () => {
    let list: RecentItem[] = [];
    for (let i = 0; i < 10; i++) list = rememberRecent(list, item(String(i)));
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[0]!.id).toBe("9");
    list = rememberRecent(list, item("5"));
    expect(list.map((r) => r.id)).toEqual(["5", "9", "8", "7", "6", "4", "3", "2"]);
  });

  it("reads back only what is well formed", () => {
    expect(parseRecent("nope")).toEqual([]);
    expect(
      parseRecent([
        item("1"),
        { kind: "pool", id: "p", title: "x", open: { screen: "customer", id: "c" } },
        null,
      ]),
    ).toEqual([item("1")]);
  });

  it("remembers what a result opens, but not pools", () => {
    const [customers] = searchShop("ochoa", records, at).groups;
    expect(recentFromHit(customers!.hits[0]!)).toMatchObject({ kind: "customer", id: "c1" });
    const [pools] = searchShop("palm", records, at).groups;
    expect(pools!.hits[0]!.open).toEqual({ screen: "customer", id: "c1" });
    expect(recentFromHit(pools!.hits[0]!)).toBeNull();
  });
});
