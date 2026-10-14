import { describe, expect, it } from "vitest";
import {
  AuthError,
  LocalStore,
  SupabaseTransport,
  SyncEngine,
  isAuthFailure,
  isStorageFull,
  type Mutation,
  type PullPage,
  type PushResponse,
  type SqlDatabase,
  type SyncTransport,
} from "../src";
import { memoryDb } from "./sqlite";

// M11 offline edge cases: a revoked sign-in, a full phone, and an app update with changes
// still waiting to sync. In every case nothing already saved on the phone is lost.

const C = "00000000-0000-4000-8000-0000000000c1";

class Server implements SyncTransport {
  signedOut = false;
  received: Mutation[][] = [];
  async push(mutations: Mutation[]): Promise<PushResponse> {
    if (this.signedOut) throw new AuthError("JWT expired");
    this.received.push(mutations);
    return {
      server_hlc: "1800000000000-0000-server",
      results: mutations.map((m) => ({ id: m.id, status: "applied" as const })),
    };
  }
  async pull(): Promise<PullPage> {
    return { rows: [], done: true, cursor: { from: "1" }, server_hlc: "1800000000000-0000-server" };
  }
}

describe("a revoked or expired sign-in", () => {
  it("is told apart from a network failure", () => {
    expect(isAuthFailure({ message: "JWT expired", code: "PGRST303" })).toBe(true);
    expect(isAuthFailure({ message: "Invalid Refresh Token: Refresh Token Not Found" })).toBe(true);
    expect(isAuthFailure({ message: "whatever", status: 401 })).toBe(true);
    expect(isAuthFailure({ message: "TypeError: Network request failed" })).toBe(false);
    expect(isAuthFailure({ message: "permission denied for table job", code: "42501" })).toBe(
      false,
    );
  });

  it("the transport reports it as AuthError", async () => {
    const t = new SupabaseTransport({
      rpc: async () => ({ data: null, error: { message: "JWT expired", code: "PGRST303" } }),
    });
    await expect(t.pull({}, 10)).rejects.toBeInstanceOf(AuthError);
  });

  it("keeps every change until the user signs in again, then sends them", async () => {
    const store = LocalStore.open(memoryDb());
    const server = new Server();
    const engine = new SyncEngine(store, server);
    store.insert("customer", C, { name: "Saved offline" });
    server.signedOut = true;
    const first = await engine.sync();
    expect(first).toMatchObject({ authFailed: true, pending: 1, pushed: 0 });
    expect(store.problems()).toHaveLength(0);
    server.signedOut = false;
    const second = await engine.sync();
    expect(second).toMatchObject({ pushed: 1, pending: 0 });
    expect(second.authFailed).toBeUndefined();
  });
});

describe("a full phone", () => {
  /** SQLite that runs out of space once `full` is set: writes to tables fail, like SQLITE_FULL. */
  function fillableDb(): SqlDatabase & { full: boolean } {
    const inner = memoryDb();
    const db = {
      full: false,
      run: (sql: string, params?: unknown[]) => {
        if (db.full && /^\s*(insert|update)/i.test(sql))
          throw new Error("database or disk is full (code 13 SQLITE_FULL)");
        inner.run(sql, params);
      },
      all: inner.all,
      get: inner.get,
      transaction: inner.transaction,
    };
    return db as SqlDatabase & { full: boolean };
  }

  it("recognises the error", () => {
    expect(isStorageFull(new Error("database or disk is full (code 13 SQLITE_FULL)"))).toBe(true);
    expect(isStorageFull(new Error("ENOSPC: no space left on device, write"))).toBe(true);
    expect(isStorageFull(new Error("UNIQUE constraint failed"))).toBe(false);
  });

  it("saves nothing half-way, and keeps what was saved before", () => {
    const db = fillableDb();
    const store = LocalStore.open(db);
    const id = store.insert("customer", C, { name: "Before" });
    db.full = true;
    expect(() => store.write("customer", id, C, { name: "After" })).toThrow(/disk is full/);
    expect(() => store.insert("finding", C, { title: "Lost?" })).toThrow(/disk is full/);
    expect(store.get("customer", id)).toMatchObject({ name: "Before" });
    expect(store.list("finding")).toHaveLength(0);
    expect(store.pendingCount()).toBe(1);
    db.full = false;
    store.write("customer", id, C, { name: "After" });
    expect(store.get("customer", id)).toMatchObject({ name: "After" });
  });
});

describe("an app update with changes still waiting", () => {
  it("opens the old database and keeps its unsent changes and uploads", () => {
    const db = memoryDb();
    // The first released schema (before resumable uploads and signature uploads).
    db.run(`create table sync_records (table_name text not null, id text not null,
      company_id text not null, data text not null, deleted integer not null default 0,
      primary key (table_name, id))`);
    db.run(`create table sync_outbox (seq integer primary key autoincrement,
      mutation_id text not null, table_name text not null, row_id text not null,
      company_id text not null, fields text not null, created_at integer not null,
      attempts integer not null default 0, status text not null default 'pending', last_error text)`);
    db.run(`create table sync_meta (key text primary key, value text not null)`);
    db.run(`create table upload_queue (media_id text primary key, company_id text not null,
      local_path text not null, storage_path text not null, mime_type text not null,
      attempts integer not null default 0, next_attempt_at integer not null default 0, last_error text)`);
    db.run(
      "insert into sync_meta (key, value) values ('device_id', 'olddevice'), ('schema_version', '1')",
    );
    db.run(
      `insert into sync_records (table_name, id, company_id, data) values ('finding', 'f1', ?, ?)`,
      [C, JSON.stringify({ id: "f1", company_id: C, title: "Crack at the skimmer" })],
    );
    db.run(
      `insert into sync_outbox (mutation_id, table_name, row_id, company_id, fields, created_at)
       values ('m1', 'finding', 'f1', ?, ?, 1)`,
      [
        C,
        JSON.stringify({
          title: { v: "Crack at the skimmer", hlc: "1700000000000-0000-olddevice" },
        }),
      ],
    );
    db.run(
      `insert into upload_queue (media_id, company_id, local_path, storage_path, mime_type)
       values ('p1', ?, 'file:///p1.jpg', 'c1/j1/p1.jpg', 'image/jpeg')`,
      [C],
    );

    const store = LocalStore.open(db);
    expect(store.deviceId).toBe("olddevice");
    expect(store.pendingCount()).toBe(1);
    const batch = store.pendingBatch(10);
    expect(batch.mutations[0]).toMatchObject({ table: "finding", row_id: "f1" });
    expect(
      db.get<{ record_table: string }>(
        "select record_table from upload_queue where media_id = 'p1'",
      ),
    ).toEqual({ record_table: "media" });
    expect(
      db.get<{ value: string }>("select value from sync_meta where key = 'schema_version'"),
    ).toEqual({
      value: "4",
    });
  });
});
