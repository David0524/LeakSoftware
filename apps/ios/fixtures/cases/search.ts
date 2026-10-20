import {
  RECENT_LIMIT,
  SEARCH_DEBOUNCE_MS,
  SEARCH_GROUP_LIMIT,
  SEARCH_GROUP_TITLES,
  SEARCH_MIN_CHARS,
  SEARCH_OFFLINE,
  SEARCH_PLACEHOLDER,
  SEARCH_WORDS,
  foldText,
  noResultsText,
  normalizeSearch,
  parseRecent,
  recentFromHit,
  rememberRecent,
  searchShop,
  searchWords,
  shortDate,
  type RecentItem,
  type SearchHit,
  type SearchOptions,
  type SearchRecords,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

const at = { now: "2026-10-20T16:00:00Z", timeZone: "America/Phoenix" };

const records: SearchRecords = {
  customers: [
    { id: "c1", name: "Sam Ochoa", phone: "(602) 555-0142", email: "sam@example.com" },
    { id: "c2", name: "José Núñez", email: "jose@example.com" },
    { id: "c3", name: "Hoang Tran", company_name: "Desert Pools" },
    { id: "c4", name: "Sam Gone", deleted_at: "2026-10-01T00:00:00Z" },
    { id: "c5", name: "Lee Park", email: "ochoa.fan@example.com", phone: "+16025551038" },
    { id: "c6", name: "O'Neil-Smith" },
  ],
  pools: [
    {
      id: "p1",
      customer_id: "c1",
      address_line1: "1038 Palm Lane",
      city: "Mesa",
      customer_name: "Sam Ochoa",
    },
    {
      id: "p2",
      customer_id: "c2",
      address_line1: "77 Ocotillo Rd",
      city: null,
      customer_name: "José Núñez",
    },
    {
      id: "p3",
      customer_id: null,
      address_line1: "5 Gone St",
      city: "Mesa",
      deleted_at: "2026-10-01T00:00:00Z",
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
    {
      id: "j5",
      number: null,
      type: "inspection",
      scheduled_start: "2025-12-01T16:30:00Z",
      customer_name: "José Núñez",
    },
    {
      id: "j6",
      number: 2001,
      type: "unknown",
      scheduled_start: "2026-10-21T16:30:00Z",
      customer_name: null,
    },
  ],
  quotes: [
    {
      id: "q1",
      job_id: "j1",
      number: 1012,
      status: "sent",
      total_cents: 97500,
      created_at: "2026-10-14T00:00:00Z",
      customer_name: "Sam Ochoa",
    },
    {
      id: "q2",
      job_id: "j2",
      number: 1013,
      status: "accepted",
      total_cents: 0,
      created_at: "2026-10-15T00:00:00Z",
      customer_name: "Lee Park",
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
      created_at: "2026-10-15T00:00:00Z",
      customer_name: "Sam Ochoa",
    },
    {
      id: "i2",
      job_id: "j3",
      number: 1029,
      status: "paid",
      total_cents: 37500,
      amount_paid_cents: 37500,
      created_at: "2026-10-16T00:00:00Z",
      customer_name: "Sam Ochoa",
    },
    {
      id: "i3",
      job_id: "j1",
      number: 1030,
      status: "sent",
      total_cents: 20000,
      created_at: "2026-10-17T00:00:00Z",
      customer_name: "Sam Ochoa",
    },
    {
      id: "i4",
      job_id: "j1",
      number: null,
      status: "draft",
      total_cents: 1000,
      created_at: "2026-10-18T00:00:00Z",
      customer_name: "Sam Ochoa",
    },
  ],
};

const many: SearchRecords = {
  customers: Array.from({ length: 7 }, (_, i) => ({ id: `x${i}`, name: `Smith ${7 - i}` })),
  jobs: Array.from({ length: 7 }, (_, i) => ({
    id: `y${i}`,
    number: 3000 + i,
    type: "repair",
    scheduled_start: `2026-10-${String(10 + i).padStart(2, "0")}T16:00:00Z`,
    customer_name: "Pat Smith",
  })),
};

const queries = [
  "",
  "s",
  " s ",
  "sa",
  "och",
  "hoa",
  "ochoa sam",
  "sam ochoa",
  "JOSE nun",
  "jose",
  "Núñez",
  "gone",
  "1038",
  "#1038",
  "# 1038",
  "Job 1038",
  "job #1038",
  "quote 1012",
  "invoice 1028",
  "inv 10",
  "jobs ochoa",
  "103",
  "10",
  "#1",
  "602.555.0142",
  "(602) 555-0142",
  "+1 602 555 0142",
  "0142",
  "555",
  "example",
  "ochoa example",
  "palm",
  "mesa palm",
  "ocot",
  "desert",
  "o'neil",
  "neil smith",
  "zzz",
  "ochoa 1038",
  "new",
  "job",
  "  sam   ",
];

const options: SearchOptions[] = [
  at,
  { ...at, limit: 1 },
  { ...at, group: "jobs", limit: 100 },
  { ...at, timeZone: "Pacific/Honolulu", now: "2027-01-02T00:00:00Z" },
];

const hit = (title: string): SearchHit => ({
  kind: "job",
  id: "j1",
  title,
  detail: "Sam Ochoa",
  meta: null,
  open: { screen: "job", id: "j1" },
});

const item = (id: string, kind: RecentItem["kind"] = "job"): RecentItem => ({
  kind,
  id,
  title: `Record ${id}`,
  detail: id === "2" ? null : "Detail",
  open: { screen: kind === "customer" ? "customer" : "job", id },
});

// search.ts: one search across the shop, and Recent.
export const search: ModuleCases = {
  constants: rule(
    () => ({
      SEARCH_PLACEHOLDER,
      SEARCH_MIN_CHARS,
      SEARCH_DEBOUNCE_MS,
      SEARCH_GROUP_LIMIT,
      SEARCH_OFFLINE,
      RECENT_LIMIT,
      SEARCH_WORDS,
      SEARCH_GROUP_TITLES,
    }),
    [[]],
  ),
  foldText: rule(
    (s: string | null) => foldText(s),
    [["José Núñez"], ["ÀÉÎÕÜ ç"], ["Straße"], [""], [null]],
  ),
  searchWords: rule(
    (s: string | null) => searchWords(s),
    [["O'Neil-Smith"], ["sam@example.com"], ["  "], [null], ["1038 Palm Ln."]],
  ),
  normalizeSearch: rule(
    (q: string) => normalizeSearch(q),
    queries.map((q) => [q]),
  ),
  noResultsText: rule((q: string) => noResultsText(q), [["zzz"], ["  ochoa  "]]),
  shortDate: rule(
    (iso: string, now: string, tz: string) => shortDate(iso, new Date(now), tz),
    [
      ["2026-10-14T16:30:00Z", at.now, at.timeZone],
      ["2025-12-01T16:30:00Z", at.now, at.timeZone],
      ["2026-10-21T06:30:00Z", at.now, "America/Phoenix"],
      ["2026-10-21T06:30:00Z", at.now, "Asia/Tokyo"],
    ],
  ),
  searchShop: rule(
    (q: string, r: SearchRecords, o: SearchOptions) => searchShop(q, r, o),
    [
      ...queries.map((q) => [q, records, at] as [string, SearchRecords, SearchOptions]),
      ...options.flatMap((o) =>
        ["ochoa", "103", "smith"].map(
          (q) => [q, q === "smith" ? many : records, o] as [string, SearchRecords, SearchOptions],
        ),
      ),
      ["smith", many, { ...at, group: "customers", limit: 100 }],
      ["ochoa", {}, at],
    ],
  ),
  rememberRecent: rule(
    (list: RecentItem[], add: RecentItem) => rememberRecent(list, add),
    [
      [[], item("1")],
      [[item("1"), item("2")], item("2")],
      [[item("1"), item("2")], item("2", "customer")],
      [Array.from({ length: 8 }, (_, i) => item(String(i))), item("9")],
      [Array.from({ length: 8 }, (_, i) => item(String(i))), item("7")],
    ],
  ),
  parseRecent: rule(
    (stored: unknown) => parseRecent(stored),
    [
      [null],
      ["nope"],
      [[item("1"), item("2", "customer")]],
      [[{ ...item("1"), open: { screen: "job", id: "1", section: "quotes" } }]],
      [[{ ...item("1"), open: { screen: "job", id: "1", section: "other" } }]],
      [[{ kind: "pool", id: "p", title: "x", open: { screen: "customer", id: "c" } }]],
      [[{ kind: "job", id: 5, title: "x", open: { screen: "job", id: "c" } }]],
      [[{ kind: "job", id: "5", title: "x", open: { screen: "map", id: "c" } }]],
      [[{ kind: "job", id: "5", title: "x" }]],
      [
        [
          1,
          null,
          "x",
          { kind: "job", id: "5", title: "x", detail: 3, open: { screen: "job", id: "5" } },
        ],
      ],
      [Array.from({ length: 10 }, (_, i) => item(String(i)))],
    ],
  ),
  recentFromHit: rule(
    (h: SearchHit) => recentFromHit(h),
    [
      [hit("Job #1038 · Leak detection")],
      [{ ...hit("x"), kind: "pool", open: { screen: "customer", id: "c1" } }],
      [{ ...hit("x"), open: null }],
      [{ ...hit("Quote #1"), kind: "quote", open: { screen: "job", id: "j1", section: "quotes" } }],
    ],
  ),
};
