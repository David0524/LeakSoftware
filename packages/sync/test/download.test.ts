import { describe, expect, it } from "vitest";
import {
  FIRST_PULL_PAGE,
  LocalStore,
  OPENING_PULL_PAGE,
  SupabaseTransport,
  SyncEngine,
  type DownloadState,
  type PullCursor,
  type PullPage,
  type PushResponse,
  type SyncTransport,
} from "../src";
import { memoryDb } from "./sqlite";

// The first download (owner, 2026-10-20: "Downloading your company takes a long time. Give a
// more interesting loading bar."; docs/design/2026-10-20-gestures.md section 11): the server's
// count, rows counted per table as pages are saved, 2,000-row pages, and the next page asked
// for while one is being saved.

const C = "00000000-0000-4000-8000-0000000000c1";
const HLC = "1800000000000-0000-server";
const row = (table: string, n: number) => ({
  table,
  xid: String(n),
  row: { id: `${table}${n}`, company_id: C, name: `n${n}` },
});

class FakeServer implements SyncTransport {
  pages: PullPage[] = [];
  /** Each pull: its cursor, page size, and how many customers the phone had saved then. */
  pulls: { cursor: PullCursor; size: number; saved: number }[] = [];
  totals: Record<string, number> | null | "throw" = null;
  counted = 0;
  store: LocalStore | null = null;

  async push(): Promise<PushResponse> {
    return { server_hlc: HLC, results: [] };
  }

  async pull(cursor: PullCursor, size: number): Promise<PullPage> {
    this.pulls.push({ cursor, size, saved: this.store?.list("customer").length ?? 0 });
    return this.pages.shift() ?? { rows: [], done: true, cursor: { from: "9" }, server_hlc: HLC };
  }

  async count(): Promise<Record<string, number> | null> {
    this.counted += 1;
    if (this.totals === "throw") throw new Error("offline");
    return this.totals;
  }
}

function setup(over: { totals?: FakeServer["totals"] } = {}) {
  const store = LocalStore.open(memoryDb());
  const server = new FakeServer();
  server.store = store;
  server.totals = over.totals ?? { customer: 3, property: 1 };
  server.pages = [
    {
      rows: [row("customer", 1), row("customer", 2)],
      done: false,
      cursor: { from: "0", high: "9", after: ["2", "customer", "customer2"] },
      server_hlc: HLC,
    },
    {
      rows: [row("customer", 3), row("property", 1)],
      done: true,
      cursor: { from: "9" },
      server_hlc: HLC,
    },
  ];
  const seen: DownloadState[] = [];
  const engine = new SyncEngine(store, server, { onDownload: (d) => seen.push(d) });
  return { store, server, seen, engine };
}

describe("the first download", () => {
  it("counts once, alongside the first page, then reports rows per table after each page", async () => {
    const { server, seen, engine } = setup();
    const s = await engine.sync();
    expect(s.error).toBeUndefined();
    expect(server.counted).toBe(1);
    const totals = { customer: 3, property: 1 };
    // The first page is reported before the count is waited for, so the app can open on it.
    expect(seen).toEqual([
      { pulled: {}, totals: null },
      { pulled: { customer: 2 }, totals: null },
      { pulled: { customer: 2 }, totals },
      { pulled: { customer: 3, property: 1 }, totals },
    ]);
  });

  it("opens with a small page (the company first), then 2,000 rows a page, then the usual size", async () => {
    const { server, engine } = setup();
    await engine.sync();
    expect(server.pulls.map((p) => p.size)).toEqual([OPENING_PULL_PAGE, FIRST_PULL_PAGE]);
    server.pulls = [];
    await engine.sync();
    expect(server.pulls.map((p) => p.size)).toEqual([500]);
  });

  it("asks for the next page before saving the one it has, in cursor order", async () => {
    const { server, engine } = setup();
    await engine.sync();
    // The second request went out with the first page's cursor, before its rows were saved.
    expect(server.pulls[0]).toMatchObject({ cursor: {}, saved: 0 });
    expect(server.pulls[1]).toMatchObject({
      cursor: { from: "0", high: "9", after: ["2", "customer", "customer2"] },
      saved: 0,
    });
    // Nothing asked for past the last page.
    expect(server.pulls).toHaveLength(2);
  });

  it("goes on without a number when the count fails", async () => {
    const { store, server, seen, engine } = setup({ totals: "throw" });
    const s = await engine.sync();
    expect(s.error).toBeUndefined();
    expect(store.list("customer")).toHaveLength(3);
    expect(server.counted).toBe(1);
    expect(seen.every((d) => d.totals === null)).toBe(true);
    expect(seen.at(-1)!.pulled).toEqual({ customer: 3, property: 1 });
  });

  it("an ordinary pull reports nothing and doesn't count", async () => {
    const { server, seen, engine } = setup();
    await engine.sync();
    seen.length = 0;
    server.pages = [
      { rows: [row("customer", 4)], done: true, cursor: { from: "10" }, server_hlc: HLC },
    ];
    await engine.sync();
    expect(seen).toEqual([]);
    expect(server.counted).toBe(1);
  });

  it("a resumed first download still reports when the app says so", async () => {
    const store = LocalStore.open(memoryDb());
    const server = new FakeServer();
    server.totals = { customer: 1 };
    server.pages = [
      { rows: [row("customer", 1)], done: true, cursor: { from: "1" }, server_hlc: HLC },
    ];
    // A cursor is stored from an earlier, interrupted run.
    store.applyPage({ rows: [], done: false, cursor: { from: "0", high: "5" }, server_hlc: HLC });
    const seen: DownloadState[] = [];
    await new SyncEngine(store, server, {
      onDownload: (d) => seen.push(d),
      firstDownload: () => true,
    }).sync();
    expect(seen.at(-1)).toEqual({ pulled: { customer: 1 }, totals: { customer: 1 } });
    expect(server.pulls[0]!.size).toBe(OPENING_PULL_PAGE);
  });
});

describe("SupabaseTransport.count", () => {
  it("reads sync_pull_count, and null on any failure", async () => {
    const ok = new SupabaseTransport({
      rpc: async (fn) => ({
        data: fn === "sync_pull_count" ? { customer: 12, job: "4", bad: -1 } : null,
        error: null,
      }),
    });
    expect(await ok.count()).toEqual({ customer: 12, job: 4 });
    const old = new SupabaseTransport({
      rpc: async () => ({ data: null, error: { message: "function not found", code: "PGRST202" } }),
    });
    expect(await old.count()).toBeNull();
    const down = new SupabaseTransport({
      rpc: async () => {
        throw new Error("offline");
      },
    });
    expect(await down.count()).toBeNull();
  });
});
