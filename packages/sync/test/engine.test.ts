import { describe, expect, it } from "vitest";
import {
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

  async pull(_cursor: PullCursor): Promise<PullPage> {
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
});
