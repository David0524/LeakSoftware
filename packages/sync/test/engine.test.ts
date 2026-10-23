import { describe, expect, it } from "vitest";
import {
  AuthError,
  isNetworkFailure,
  LocalStore,
  SyncEngine,
  type Mutation,
  type PullCursor,
  type PullPage,
  type PushResponse,
  type SyncTransport,
} from "../src";
import { memoryDb } from "./sqlite";

const C = "00000000-0000-4000-8000-0000000000c1";

class FakeServer implements SyncTransport {
  received: Mutation[][] = [];
  failNextPush = false;
  rejectTables = new Set<string>();
  readOnly = false;
  pages: PullPage[] = [];
  cursors: PullCursor[] = [];
  scopeValue = "c1:all";
  failPullAt = -1;
  /** The next this many pulls fail with this error. */
  failingPulls = 0;
  pullError: Error = new Error("network down");

  async scope(): Promise<string> {
    return this.scopeValue;
  }

  async push(mutations: Mutation[]): Promise<PushResponse> {
    if (this.failNextPush) {
      this.failNextPush = false;
      throw new Error("network down");
    }
    this.received.push(mutations);
    return {
      server_hlc: "1800000000000-0000-server",
      results: mutations.map((m) =>
        this.readOnly
          ? { id: m.id, status: "rejected", code: "TL423", error: "This shop is read-only." }
          : this.rejectTables.has(m.table)
            ? { id: m.id, status: "rejected", code: "42501", error: "not allowed" }
            : { id: m.id, status: "applied" },
      ),
    };
  }

  async pull(cursor: PullCursor): Promise<PullPage> {
    this.cursors.push(cursor);
    if (this.cursors.length - 1 === this.failPullAt) throw new Error("network down");
    if (this.failingPulls > 0) {
      this.failingPulls -= 1;
      throw this.pullError;
    }
    return (
      this.pages.shift() ?? {
        rows: [],
        done: true,
        cursor: { from: "1" },
        server_hlc: "1800000000000-0000-server",
      }
    );
  }
}

describe("SyncEngine", () => {
  it("pushes merged changes and clears the outbox", async () => {
    const store = LocalStore.open(memoryDb());
    const server = new FakeServer();
    const id = store.insert("customer", C, { name: "a" });
    store.write("customer", id, C, { name: "b" });
    const s = await new SyncEngine(store, server).sync();
    expect(s).toMatchObject({ pushed: 1, pending: 0 });
    expect(server.received[0]![0]!.fields.name!.v).toBe("b");
  });

  it("keeps changes when the network fails and sends them next time", async () => {
    const store = LocalStore.open(memoryDb());
    const server = new FakeServer();
    store.insert("customer", C, { name: "a" });
    server.failNextPush = true;
    const engine = new SyncEngine(store, server);
    const first = await engine.sync();
    expect(first.error).toBe("network down");
    expect(first.pending).toBe(1);
    const second = await engine.sync();
    expect(second).toMatchObject({ pushed: 1, pending: 0 });
  });

  it("does not loop on rejected changes", async () => {
    const store = LocalStore.open(memoryDb());
    const server = new FakeServer();
    server.rejectTables.add("quote");
    store.insert("quote", C, { status: "accepted" });
    store.insert("customer", C, { name: "fine" });
    const s = await new SyncEngine(store, server).sync();
    expect(s).toMatchObject({ pushed: 1, rejected: 1, pending: 0 });
    expect(server.received).toHaveLength(1);
    expect(store.problems()).toHaveLength(1);
  });

  it("keeps changes on the device while the shop is read-only, and sends them once paid", async () => {
    const store = LocalStore.open(memoryDb());
    const server = new FakeServer();
    server.readOnly = true;
    store.insert("customer", C, { name: "kept" });
    const engine = new SyncEngine(store, server);
    const first = await engine.sync();
    expect(first).toMatchObject({
      pushed: 0,
      rejected: 0,
      pending: 1,
      readOnly: "This shop is read-only.",
    });
    expect(first.error).toBeUndefined();
    expect(store.problems()).toHaveLength(0);
    server.readOnly = false;
    const second = await engine.sync();
    expect(second).toMatchObject({ pushed: 1, pending: 0 });
    expect(second.readOnly).toBeUndefined();
  });

  it("pushes in batches", async () => {
    const store = LocalStore.open(memoryDb());
    const server = new FakeServer();
    for (let i = 0; i < 5; i++) store.insert("customer", C, { name: `c${i}` });
    await new SyncEngine(store, server, { pushBatch: 2 }).sync();
    expect(server.received.map((b) => b.length)).toEqual([2, 2, 1]);
  });

  it("pulls every page", async () => {
    const store = LocalStore.open(memoryDb());
    const server = new FakeServer();
    const row = (n: number) => ({
      table: "customer",
      xid: String(n),
      row: { id: `id${n}`, company_id: C, name: `n${n}` },
    });
    server.pages = [
      {
        rows: [row(1), row(2)],
        done: false,
        cursor: { from: "0", high: "9", after: ["2", "customer", "id2"] },
        server_hlc: "1800000000000-0000-server",
      },
      {
        rows: [row(3)],
        done: true,
        cursor: { from: "9" },
        server_hlc: "1800000000000-0000-server",
      },
    ];
    const s = await new SyncEngine(store, server).sync();
    expect(s.pulled).toBe(3);
    expect(store.list("customer")).toHaveLength(3);
    expect(store.getCursor()).toEqual({ from: "9" });
  });

  it("runs one sync at a time", async () => {
    const store = LocalStore.open(memoryDb());
    const engine = new SyncEngine(store, new FakeServer());
    expect(engine.sync()).toBe(engine.sync());
  });

  describe("when what the tech may see changes", () => {
    const row = (table: string, id: string, extra: Record<string, unknown> = {}) => ({
      table,
      xid: "5",
      row: { id, company_id: C, ...extra },
    });
    const page = (rows: ReturnType<typeof row>[], done = true): PullPage => ({
      rows,
      done,
      cursor: { from: "9" },
      server_hlc: "1800000000000-0000-server",
    });
    const J1 = "00000000-0000-4000-8000-0000000000a1";
    const J2 = "00000000-0000-4000-8000-0000000000a2";

    it("pulls everything again and drops jobs that are no longer theirs", async () => {
      const store = LocalStore.open(memoryDb());
      const server = new FakeServer();
      const engine = new SyncEngine(store, server);
      server.pages = [page([row("job", J1), row("job", J2)])];
      await engine.sync();
      expect(store.getScope()).toBe("c1:all");
      expect(store.get("job", J2)).toBeTruthy();

      // Same scope: an ordinary incremental pull from the saved cursor.
      await engine.sync();
      expect(server.cursors.at(-1)).toEqual({ from: "9" });

      // The owner limits techs; J2 isn't theirs. Everything comes again, J2 is gone.
      server.scopeValue = "c1:own1";
      server.pages = [page([row("job", J1)], false), page([])];
      const s = await engine.sync();
      expect(server.cursors.at(-2)).toEqual({});
      expect(s.pulled).toBe(1);
      expect(store.get("job", J1)).toBeTruthy();
      expect(store.get("job", J2)).toBeUndefined();
      expect(store.getScope()).toBe("c1:own1");
    });

    it("keeps rows with changes not yet sent", async () => {
      const store = LocalStore.open(memoryDb());
      const server = new FakeServer();
      const engine = new SyncEngine(store, server);
      server.pages = [page([row("job", J1), row("job", J2)])];
      await engine.sync();
      server.readOnly = true; // the change stays unsent
      store.write("job", J2, C, { summary_notes: "found the leak" });
      server.scopeValue = "c1:own2";
      server.pages = [page([row("job", J1)])];
      await engine.sync();
      expect(store.get("job", J2)).toBeTruthy();
    });

    it("starts over again when the full pull is interrupted", async () => {
      const store = LocalStore.open(memoryDb());
      const server = new FakeServer();
      const engine = new SyncEngine(store, server, { pullRetryDelays: [0, 0, 0] });
      server.pages = [page([row("job", J1), row("job", J2)])];
      await engine.sync();
      server.scopeValue = "c1:own3";
      server.failingPulls = 4; // the next pull fails, and its three retries
      const failed = await engine.sync();
      expect(failed.error).toBe("network down");
      expect(store.getScope()).toBe("c1:all");
      expect(store.get("job", J2)).toBeTruthy();
      server.pages = [page([row("job", J1)])];
      await engine.sync();
      expect(server.cursors.at(-1)).toEqual({});
      expect(store.get("job", J2)).toBeUndefined();
    });
  });

  describe("a pull page that fails on the network", () => {
    const J1 = "00000000-0000-4000-8000-0000000000a1";
    const row = (table: string, id: string) => ({ table, xid: "5", row: { id, company_id: C } });
    const page = (rows: ReturnType<typeof row>[]): PullPage => ({
      rows,
      done: true,
      cursor: { from: "9" },
      server_hlc: "1800000000000-0000-server",
    });
    function setup() {
      const store = LocalStore.open(memoryDb());
      const server = new FakeServer();
      const waits: number[] = [];
      const engine = new SyncEngine(store, server, {
        sleep: async (ms) => {
          waits.push(ms);
        },
      });
      return { store, server, waits, engine };
    }

    it("is asked for again after 1, 3 and 8 seconds, from the same cursor", async () => {
      const { store, server, waits, engine } = setup();
      server.pages = [page([row("job", J1)])];
      server.failingPulls = 3;
      const s = await engine.sync();
      expect(s.error).toBeUndefined();
      expect(waits).toEqual([1000, 3000, 8000]);
      expect(server.cursors).toEqual([{}, {}, {}, {}]);
      expect(store.get("job", J1)).toBeTruthy();
    });

    it("fails the sync after three retries, and the next sync carries on", async () => {
      const { store, server, waits, engine } = setup();
      server.pages = [page([row("job", J1)])];
      server.failingPulls = 4;
      const s = await engine.sync();
      expect(s.error).toBe("network down");
      expect(waits).toEqual([1000, 3000, 8000]);
      expect(store.get("job", J1)).toBeUndefined();
      expect((await engine.sync()).error).toBeUndefined();
      expect(store.get("job", J1)).toBeTruthy();
    });

    it("is not retried when the sign-in is refused or the server says no", async () => {
      for (const error of [
        new AuthError("JWT expired"),
        new Error("permission denied for table job"),
      ]) {
        const { server, waits, engine } = setup();
        server.failingPulls = 1;
        server.pullError = error;
        const s = await engine.sync();
        expect(s.error).toBe(error.message);
        expect(waits).toEqual([]);
        expect(server.cursors.length).toBe(1);
      }
    });

    it("tells network failures from other errors", () => {
      for (const m of [
        "TypeError: Network request failed",
        "FetchError: request to https://x failed",
        "The Internet connection appears to be offline.",
        "The request timed out.",
        "connection reset",
        "Error Domain=NSURLErrorDomain Code=-1005",
        "504 Gateway Timeout",
      ]) {
        expect(isNetworkFailure(new Error(m))).toBe(true);
      }
      for (const m of ["permission denied for table job", "duplicate key value"]) {
        expect(isNetworkFailure(new Error(m))).toBe(false);
      }
      expect(isNetworkFailure(new AuthError("network"))).toBe(false);
    });
  });
});
