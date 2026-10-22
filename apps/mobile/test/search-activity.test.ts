import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalStore, type Uploader } from "@leakbook/sync";
import type { ActivityEvent, RecentItem } from "@leakbook/core";
import { memoryDb } from "../../../packages/sync/test/sqlite";

// Search and Activity on the phone (owner, 2026-10-20; docs/plans/search-and-activity.md):
// search runs the shared rule over this phone's rows (so offline too), Recent is kept on the
// phone and goes on sign out, and Activity is read from the server like the Dashboard.

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
const {
  RECENT_KEY,
  clearRecent,
  loadRecent,
  openPath,
  rememberOpened,
  saveRecent,
  searchPhone,
  searchRecords,
} = await import("../src/lib/shopSearch");
const { activityPath, appendActivity, fetchActivity, fetchActivityUnread, markActivitySeen } =
  await import("../src/lib/activity");

const TZ = "America/Phoenix";
const now = new Date("2026-10-20T17:00:00Z");

function kvStore() {
  const map = new Map<string, string>();
  return {
    map,
    get: (k: string) => map.get(k) ?? null,
    set: (k: string, v: string) => void map.set(k, v),
    remove: (k: string) => void map.delete(k),
  };
}

const rows = () => ({
  customers: [
    { id: "c1", name: "Sam Ochoa", phone: "(602) 555-0142", email: "sam@example.com" },
    { id: "c2", name: "Maria Alvarez", phone: null, email: "maria@example.com" },
    { id: "c3", name: "Gone Customer", deleted_at: "2026-10-01T00:00:00Z" },
  ],
  properties: [
    { id: "p1", customer_id: "c1", address_line1: "12 Palm Lane", city: "Mesa" },
    { id: "p2", customer_id: "c2", address_line1: "4 Ocotillo Way", city: "Tempe" },
  ],
  jobs: [
    {
      id: "j1",
      number: 1038,
      type: "detection",
      status: "scheduled",
      property_id: "p1",
      scheduled_start: "2026-10-21T16:00:00Z",
    },
    // Billed to someone other than the pool's owner: the bill-to name shows, as on the website.
    {
      id: "j2",
      number: 1039,
      type: "repair",
      status: "scheduled",
      property_id: "p1",
      bill_to_customer_id: "c2",
    },
    { id: "j3", number: 1040, type: "detection", deleted_at: "2026-10-02T00:00:00Z" },
  ],
  quotes: [
    { id: "q1", job_id: "j1", number: 1012, status: "sent", total_cents: 97500 },
    // Its job was deleted: it doesn't show.
    { id: "q2", job_id: "j3", number: 1013, status: "sent", total_cents: 100 },
  ],
  invoices: [
    {
      id: "i1",
      job_id: "j1",
      number: 1028,
      status: "partially_paid",
      total_cents: 50000,
      amount_paid_cents: 12500,
    },
  ],
});

describe("search on the phone", () => {
  const records = searchRecords(rows());
  const run = (q: string, group?: "jobs" | "customers") =>
    searchPhone(q, records, { now, timeZone: TZ, group });

  it("finds customers by name in any order, by phone digits, and pools by address", () => {
    expect(run("ochoa sam").groups[0]).toMatchObject({ key: "customers", total: 1 });
    expect(run("ochoa sam").groups[0]!.hits[0]).toMatchObject({
      title: "Sam Ochoa",
      detail: "(602) 555-0142",
      open: { screen: "customer", id: "c1" },
    });
    expect(run("5550142").groups.map((g) => g.key)).toEqual(["customers"]);
    const pools = run("palm").groups.find((g) => g.key === "pools");
    expect(pools?.hits[0]).toMatchObject({
      title: "12 Palm Lane, Mesa",
      detail: "Sam Ochoa",
      open: { screen: "customer", id: "c1" },
    });
  });

  it("joins jobs, quotes, and invoices to their customer, and leaves deleted ones out", () => {
    const jobs = run("job 10").groups;
    expect(jobs.map((g) => g.key)).toEqual(["jobs"]);
    expect(jobs[0]!.hits.map((h) => h.id).sort()).toEqual(["j1", "j2"]);
    expect(run("1039").groups.find((g) => g.key === "jobs")?.hits[0]?.detail).toBe("Maria Alvarez");
    expect(run("1013").empty).toBe(true);
    expect(run("gone").empty).toBe(true);
    const quote = run("1012").groups.find((g) => g.key === "quotes")!.hits[0]!;
    expect(quote).toMatchObject({ title: "Quote #1012 · $975.00", detail: "Sam Ochoa" });
    expect(quote.open).toEqual({ screen: "job", id: "j1", section: "quotes" });
    const invoice = run("1028").groups.find((g) => g.key === "invoices")!.hits[0]!;
    expect(invoice.title).toBe("Invoice #1028 · $375.00 due");
  });

  it("waits for two characters, and See All lifts the cap for its group", () => {
    expect(run("o").groups).toEqual([]);
    expect(run("o").empty).toBe(false);
    const many = searchRecords({
      ...rows(),
      customers: Array.from({ length: 7 }, (_, i) => ({ id: `x${i}`, name: `Pat Lee ${i}` })),
    });
    const grouped = searchPhone("pat", many, { now, timeZone: TZ });
    expect(grouped.groups[0]).toMatchObject({ total: 7, more: true });
    expect(grouped.groups[0]!.hits).toHaveLength(5);
    const all = searchPhone("pat", many, { now, timeZone: TZ, group: "customers" });
    expect(all.groups[0]!.hits).toHaveLength(7);
  });

  it("opens a customer, a job, or a job at Wrap-Up for its quotes and invoice", () => {
    expect(openPath({ screen: "customer", id: "c1" })).toBe("/customers/c1");
    expect(openPath({ screen: "job", id: "j1" })).toBe("/jobs/j1");
    expect(openPath({ screen: "job", id: "j1", section: "quotes" })).toBe(
      "/jobs/j1?section=wrapup",
    );
    expect(openPath({ screen: "job", id: "j1", section: "invoice" })).toBe(
      "/jobs/j1?section=wrapup",
    );
  });
});

describe("Recent", () => {
  const item = (kind: RecentItem["kind"], id: string, jobId = id): RecentItem => ({
    kind,
    id,
    title: `${kind} ${id}`,
    detail: null,
    open: kind === "customer" ? { screen: "customer", id } : { screen: "job", id: jobId },
  });

  it("keeps the last 8 opened, newest first, moving a reopened one up", () => {
    const kv = kvStore();
    for (let i = 0; i < 10; i++) saveRecent(kv, item("customer", `c${i}`));
    saveRecent(kv, item("customer", "c5"));
    const list = loadRecent(kv);
    expect(list).toHaveLength(8);
    expect(list.map((r) => r.id).slice(0, 3)).toEqual(["c5", "c9", "c8"]);
    clearRecent(kv);
    expect(loadRecent(kv)).toEqual([]);
  });

  it("ignores anything malformed", () => {
    const kv = kvStore();
    kv.set(RECENT_KEY, "{not json");
    expect(loadRecent(kv)).toEqual([]);
    kv.set(RECENT_KEY, JSON.stringify([{ kind: "pool", id: "p1" }, item("job", "j1")]));
    expect(loadRecent(kv).map((r) => r.id)).toEqual(["j1"]);
  });

  it("a job opened from its quote isn't added a second time", () => {
    const kv = kvStore();
    saveRecent(kv, {
      ...item("quote", "q1", "j1"),
      open: { screen: "job", id: "j1", section: "quotes" },
    });
    expect(rememberOpened(kv, item("job", "j1"))).toBeNull();
    expect(loadRecent(kv).map((r) => r.kind)).toEqual(["quote"]);
    rememberOpened(kv, item("customer", "c1"));
    rememberOpened(kv, item("job", "j1"));
    expect(loadRecent(kv).map((r) => `${r.kind}:${r.id}`)).toEqual([
      "job:j1",
      "customer:c1",
      "quote:q1",
    ]);
  });

  it("goes when this phone's data is cleared on sign out", () => {
    const kv = kvStore();
    const service = new SyncService(
      LocalStore.open(memoryDb()),
      {
        auth: { getSession: async () => ({ data: { session: null } }) },
      } as never as SupabaseClient,
      kv,
      {} as Uploader,
    );
    saveRecent(kv, item("customer", "c1"));
    expect(kv.map.has(RECENT_KEY)).toBe(true);
    service.clearLocalData();
    expect(kv.map.has(RECENT_KEY)).toBe(false);
  });
});

describe("Activity", () => {
  const event = (id: string, at: string): ActivityEvent => ({
    id,
    kind: "payment_received",
    created_at: at,
    job_id: "j1",
    customer_name: "Maria Alvarez",
    amount_cents: 48750,
  });

  function rpc(result: { data?: unknown; error?: { message: string } | null }) {
    const calls: { fn: string; args: unknown }[] = [];
    return {
      calls,
      client: {
        rpc: async (fn: string, args?: unknown) => {
          calls.push({ fn, args });
          return { data: result.data ?? null, error: result.error ?? null };
        },
      } as never as SupabaseClient,
    };
  }

  it("asks activity_feed for 50 at a time, after the last event shown", async () => {
    const { calls, client } = rpc({
      data: { events: [event("e1", now.toISOString())], more: true },
    });
    const page = await fetchActivity(client, "co");
    expect(page).toMatchObject({ more: true });
    expect(page.events).toHaveLength(1);
    await fetchActivity(client, "co", { created_at: "2026-10-20T10:00:00Z", id: "e9" });
    expect(calls).toEqual([
      {
        fn: "activity_feed",
        args: { target_company: "co", before_at: null, before_id: null, page_size: 50 },
      },
      {
        fn: "activity_feed",
        args: {
          target_company: "co",
          before_at: "2026-10-20T10:00:00Z",
          before_id: "e9",
          page_size: 50,
        },
      },
    ]);
  });

  it("sends the Type menu's job type, and leaves it out for All Types (owner, 2026-10-22)", async () => {
    const { calls, client } = rpc({ data: { events: [], more: false } });
    await fetchActivity(client, "co", null, undefined, "inspection");
    await fetchActivity(client, "co", null, undefined, "all");
    expect(calls.map((c) => c.args)).toEqual([
      {
        target_company: "co",
        before_at: null,
        before_id: null,
        page_size: 50,
        job_type: "inspection",
      },
      { target_company: "co", before_at: null, before_id: null, page_size: 50 },
    ]);
  });

  it("throws when it can't reach the server, so the screen says it needs a connection", async () => {
    await expect(
      fetchActivity(rpc({ error: { message: "Failed to fetch" } }).client, "co"),
    ).rejects.toThrow();
    await expect(markActivitySeen(rpc({ error: { message: "x" } }).client)).rejects.toThrow();
  });

  it("shows the dot only when the server says there's something new", async () => {
    expect(await fetchActivityUnread(rpc({ data: true }).client, "co")).toBe(true);
    expect(await fetchActivityUnread(rpc({ data: false }).client, "co")).toBe(false);
    expect(await fetchActivityUnread(rpc({ error: { message: "no function" } }).client, "co")).toBe(
      false,
    );
  });

  it("adds the next page without showing an event twice", () => {
    const a = event("a", "2026-10-20T12:00:00Z");
    const b = event("b", "2026-10-20T11:00:00Z");
    const c = event("c", "2026-10-20T10:00:00Z");
    expect(appendActivity([a, b], [b, c]).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("opens the job, or the conversation for a text", () => {
    expect(activityPath({ screen: "job", id: "j1" })).toBe("/jobs/j1");
    expect(activityPath({ screen: "conversation", id: "v1" })).toBe("/messages/v1");
    expect(activityPath(null)).toBeNull();
  });
});
