// A new phone's first download (supabase/migrations/20261022001900_first_download.sql): it leaves
// out rows deleted before it, still gets the deletes that come after, and resumes after the app
// is killed part way without losing or reviving anything.
import { afterAll, describe, expect, it } from "vitest";
import {
  LocalStore,
  SyncEngine,
  type PullCursor,
  type PullPage,
  type SyncTransport,
} from "../../src";
import { memoryDb } from "../sqlite";
import { asUser, createCompany, PgTransport, pool, type TestCompany } from "./harness";

afterAll(async () => {
  await pool.end();
});

/** The real transport, which can drop the connection after a page with a customer in it. */
class FlakyTransport implements SyncTransport {
  /** Fail every pull after the next page that brings one of the test's customers. */
  failAfterCustomers = false;
  private failing = false;
  readonly cursors: PullCursor[] = [];

  constructor(private readonly inner: PgTransport) {}

  push = (...a: Parameters<PgTransport["push"]>) => this.inner.push(...a);
  scope = () => this.inner.scope();

  async pull(cursor: PullCursor, pageSize: number): Promise<PullPage> {
    if (this.failing) throw new Error("connection reset");
    this.cursors.push(cursor);
    const page = await this.inner.pull(cursor, pageSize);
    if (
      this.failAfterCustomers &&
      page.rows.some((r) => r.table === "customer" && String(r.row.name).startsWith("Customer"))
    ) {
      this.failing = true;
    }
    return page;
  }

  reconnect() {
    this.failing = false;
    this.failAfterCustomers = false;
  }
}

let phones = 0;
function phone(co: TestCompany, firstPullPage = 2000) {
  const store = LocalStore.open(memoryDb(), { deviceId: `first${++phones}` });
  const transport = new FlakyTransport(new PgTransport(co.owner));
  const engine = new SyncEngine(store, transport, { firstPullPage, pullRetryDelays: [0, 0] });
  return { store, transport, engine };
}

async function customers(co: TestCompany, names: string[]): Promise<string[]> {
  return asUser(co.owner, async (c) => {
    const ids: string[] = [];
    for (const name of names) {
      const r = await c.query<{ id: string }>(
        "insert into customer (company_id, name) values ($1, $2) returning id",
        [co.id, name],
      );
      ids.push(r.rows[0]!.id);
    }
    return ids;
  });
}

async function remove(co: TestCompany, ids: string[]) {
  await asUser(co.owner, (c) =>
    c.query("update customer set deleted_at = now() where id = any ($1::uuid[])", [ids]),
  );
}

async function liveOnServer(co: TestCompany): Promise<string[]> {
  const r = await pool.query<{ id: string }>(
    "select id from customer where company_id = $1 and deleted_at is null",
    [co.id],
  );
  return r.rows.map((x) => x.id).sort();
}

describe("a new phone's first download", () => {
  it("leaves out rows deleted before it, and gets deletes made after it", async () => {
    const co = await createCompany();
    const [keep, gone, later] = await customers(co, ["Keep", "Gone", "Later"]);
    await remove(co, [gone!]);

    const p = phone(co);
    expect((await p.engine.sync()).error).toBeUndefined();
    expect(p.store.get("customer", keep!)?.name).toBe("Keep");
    expect(p.store.get("customer", later!)?.name).toBe("Later");
    // Never sent, so not even a tombstone on the phone.
    expect(p.store.list("customer", { includeDeleted: true }).map((r) => r.id)).not.toContain(gone);
    expect(p.store.getCursor().first).toBeUndefined();

    await remove(co, [later!]);
    await p.engine.sync();
    expect(p.store.get("customer", later!)?.deleted_at).toBeTruthy();
    expect(p.store.list("customer").map((r) => r.id)).toContain(keep);
    expect(
      p.store
        .list("customer")
        .map((r) => r.id)
        .sort(),
    ).toEqual(await liveOnServer(co));
  });

  it("resumes after the app is killed part way, and ends matching the server", async () => {
    const co = await createCompany();
    const ids = await customers(
      co,
      Array.from({ length: 30 }, (_, i) => `Customer ${i}`),
    );
    const deletedBefore = ids.filter((_, i) => i % 3 === 0);
    await remove(co, deletedBefore);

    // Small pages, and the connection drops after the first page of customers.
    const p = phone(co, 8);
    p.transport.failAfterCustomers = true;
    const first = await p.engine.sync();
    expect(first.error).toBe("connection reset");
    const saved = p.store.getCursor();
    expect(saved.first).toBe(true);
    const delivered = p.store
      .list("customer")
      .filter((r) => String(r.name).startsWith("Customer"))
      .map((r) => r.id);
    expect(delivered.length).toBeGreaterThan(0);
    expect(delivered.length).toBeLessThan(ids.length - deletedBefore.length);

    // Meanwhile the office deletes one the phone has and one it doesn't yet, and adds one.
    const notYet = (await liveOnServer(co)).find((id) => !delivered.includes(id))!;
    await remove(co, [delivered[0]!, notYet]);
    const [added] = await customers(co, ["Added during the download"]);

    // The app opens again: the download carries on from its cursor, still as a first download.
    p.transport.reconnect();
    const before = p.transport.cursors.length;
    const resumed = await p.engine.sync();
    expect(resumed.error).toBeUndefined();
    expect(p.transport.cursors[before]).toEqual(saved);
    expect(p.transport.cursors.slice(before, -1).every((c) => c.first === true)).toBe(true);
    // What changed meanwhile comes with the next pull, deletes included.
    expect((await p.engine.sync()).error).toBeUndefined();
    expect(p.transport.cursors.at(-1)?.first).toBeUndefined();

    expect(
      p.store
        .list("customer")
        .map((r) => r.id)
        .sort(),
    ).toEqual(await liveOnServer(co));
    expect(p.store.get("customer", added!)?.name).toBe("Added during the download");
    expect(p.store.get("customer", delivered[0]!)?.deleted_at).toBeTruthy();
    // Rows deleted before the download never reach the phone.
    const onPhone = new Set(p.store.list("customer", { includeDeleted: true }).map((r) => r.id));
    for (const id of deletedBefore) expect(onPhone.has(id)).toBe(false);
  });

  it("a phone that discards a rejected change pulls everything again, deletes included", async () => {
    const co = await createCompany();
    const [a, b] = await customers(co, ["A", "B"]);
    const p = phone(co);
    await p.engine.sync();
    await remove(co, [b!]);
    await p.engine.sync();
    expect(p.store.get("customer", b!)?.deleted_at).toBeTruthy();

    // Reset as discarding a problem does: from the start, but not a first download.
    p.store.discardProblem(-1);
    expect(p.store.getCursor()).toEqual({ from: "0" });
    await p.engine.sync();
    expect(p.store.get("customer", a!)?.name).toBe("A");
    expect(p.store.get("customer", b!)?.deleted_at).toBeTruthy();
    expect(p.transport.cursors.at(-1)?.first).toBeUndefined();
  });
});
