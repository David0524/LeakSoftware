import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalStore, SyncEngine } from "../../src";
import { memoryDb } from "../sqlite";
import { asUser, createCompany, pool, PgTransport, type TestCompany } from "./harness";

// Phones keep open jobs and the last 90 days (20261012003400_phone_history_window.sql).

let co: TestCompany;
let customer: string;
let job: string;
let component: string;

beforeAll(async () => {
  co = await createCompany();
  const c = await pool.connect();
  try {
    customer = (
      await c.query<{ id: string }>(
        "insert into customer (company_id, name) values ($1, 'Old Customer') returning id",
        [co.id],
      )
    ).rows[0]!.id;
    const property = (
      await c.query<{ id: string }>(
        "insert into property (company_id, customer_id, address_line1) values ($1, $2, '1 Old Way') returning id",
        [co.id, customer],
      )
    ).rows[0]!.id;
    job = (
      await c.query<{ id: string }>(
        "insert into job (company_id, property_id, bill_to_customer_id, status) values ($1, $2, $3, 'in_progress') returning id",
        [co.id, property, customer],
      )
    ).rows[0]!.id;
    component = (
      await c.query<{ id: string }>(
        "insert into job_component (company_id, job_id, component_type_id, label) values ($1, $2, $3, 'Return 1') returning id",
        [co.id, job, co.returnTypeId],
      )
    ).rows[0]!.id;
    // Finished 200 days ago (set directly, as history would be).
    await c.query("set session_replication_role = replica");
    await c.query(
      `update job set status = 'done', scheduled_start = now() - interval '201 days',
              completed_at = now() - interval '200 days', updated_at = now() - interval '200 days'
        where id = $1`,
      [job],
    );
    await c.query("set session_replication_role = origin");
  } finally {
    c.release();
  }
});

afterAll(async () => {
  await pool.end();
});

function phone(name: string, now?: () => Date) {
  const store = LocalStore.open(memoryDb(), { deviceId: name });
  const engine = new SyncEngine(store, new PgTransport(co.owner), { now });
  return { store, engine };
}

describe("phones keep recent work", () => {
  it("a new phone skips a job finished 200 days ago, but gets its customer", async () => {
    const p = phone("new");
    await p.engine.sync();
    expect(p.store.get("job", job)).toBeUndefined();
    expect(p.store.get("job_component", component)).toBeUndefined();
    expect(p.store.get("customer", customer)).toBeDefined();
  });

  it("a reopened job comes back whole, its unchanged checklist included", async () => {
    const p = phone("reopen");
    await p.engine.sync();
    await asUser(co.owner, (c) =>
      c.query("update job set status = 'in_progress' where id = $1", [job]),
    );
    await p.engine.sync();
    expect(p.store.get("job", job)).toMatchObject({ status: "in_progress" });
    expect(p.store.get("job_component", component)).toMatchObject({ label: "Return 1" });
  });

  it("a phone drops a job a week after it ages out", async () => {
    await asUser(co.owner, (c) => c.query("update job set status = 'done' where id = $1", [job]));
    const later = new Date(Date.now() + 100 * 86_400_000);
    let now = new Date();
    const p = phone("ages", () => now);
    await p.engine.sync();
    expect(p.store.get("job", job)).toBeDefined(); // finished today: on phones

    now = later; // 100 days on: past the 90-day window and the week's margin
    await p.engine.sync();
    expect(p.store.get("job", job)).toBeUndefined();
    expect(p.store.get("job_component", component)).toBeUndefined();
    expect(p.store.get("customer", customer)).toBeDefined();
  });
});
