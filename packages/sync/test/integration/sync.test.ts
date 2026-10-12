import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  createCompany,
  device,
  localRow,
  pool,
  serverRow,
  type TestCompany,
} from "./harness";

let co: TestCompany;

beforeAll(async () => {
  co = await createCompany();
});

afterAll(async () => {
  await pool.end();
});

/** A customer, property, and job created offline on a device. */
function createJobOffline(d: ReturnType<typeof device>) {
  const customer = d.store.insert("customer", co.id, {
    name: "Maria Alvarez",
    phone: "602-555-0199",
  });
  const property = d.store.insert("property", co.id, {
    customer_id: customer,
    address_line1: "1423 Palm Ct",
    has_spa: true,
  });
  const job = d.store.insert("job", co.id, {
    property_id: property,
    bill_to_customer_id: customer,
    status: "in_progress",
    assigned_user_id: co.tech.id,
  });
  return { customer, property, job };
}

describe("two devices against the real database", () => {
  it("syncs a full offline inspection to a second device", async () => {
    const a = device("devA", co.tech);
    const b = device("devB", co.owner);
    await b.engine.sync(); // B has the company config before anything else happens

    // Device A works with no signal.
    a.transport.offline = true;
    const ids = createJobOffline(a);
    const comp = a.store.insert("job_component", co.id, {
      job_id: ids.job,
      component_type_id: co.returnTypeId,
      instance_number: 3,
      label: "Return 3",
    });
    const check = a.store.insert("checklist_item_result", co.id, {
      job_id: ids.job,
      job_component_id: comp,
      status: "inspected",
      method: "Pressure test",
    });
    const test = a.store.insert("test_result", co.id, {
      job_id: ids.job,
      job_component_id: comp,
      test_type_id: co.pressureTypeId,
      schema_version: 1,
      data: { line_name: "Return 3", start_psi: 20, end_psi: 12, duration_min: 15 },
      outcome: "fail",
    });
    const finding = a.store.insert("finding", co.id, {
      job_id: ids.job,
      job_component_id: comp,
      title: "Return 3 line break",
      severity_key: "major",
      pin_x: 0.42,
      pin_y: 0.18,
    });
    const offline = await a.engine.sync();
    expect(offline.error).toBe("offline");
    expect(offline.pending).toBe(7);

    // Back online.
    a.transport.offline = false;
    const online = await a.engine.sync();
    expect(online).toMatchObject({ pushed: 7, rejected: 0, pending: 0 });
    expect(online.error).toBeUndefined();

    await b.engine.sync();
    for (const [table, id] of [
      ["customer", ids.customer],
      ["property", ids.property],
      ["job", ids.job],
      ["job_component", comp],
      ["checklist_item_result", check],
      ["test_result", test],
      ["finding", finding],
    ] as const) {
      const server = await serverRow(table, id);
      expect(server, `${table} on server`).toBeDefined();
      expect(localRow(b, table, id), `${table} on device B`).toEqual(server);
      expect(localRow(a, table, id), `${table} on device A`).toEqual(server);
    }
    // The server assigned a job number; both devices have it.
    expect(localRow(b, "job", ids.job)?.number).toEqual(expect.any(Number));
  });

  it("resolves conflicting offline edits per field, newest wins", async () => {
    const a = device("devA", co.tech);
    const b = device("devB", co.owner);
    const { job } = createJobOffline(a);
    await a.engine.sync();
    await b.engine.sync();

    // Both offline. A edits notes first, B edits notes later and also the schedule.
    a.store.write("job", job, co.id, { summary_notes: "A: shell looks fine" });
    b.store.write("job", job, co.id, {
      summary_notes: "B: crack at the light niche",
      scheduled_start: "2026-10-20T16:00:00Z",
    });
    a.store.write("job", job, co.id, { started_at: "2026-10-12T15:00:00Z" });

    // B (later edit) reaches the server first; then A's older notes edit arrives.
    expect((await b.engine.sync()).pushed).toBe(1);
    await a.engine.sync();
    await b.engine.sync();

    const server = await serverRow("job", job);
    expect(server?.summary_notes).toBe("B: crack at the light niche");
    expect(server?.started_at).toBe("2026-10-12T15:00:00+00:00");
    expect(server?.scheduled_start).toBe("2026-10-20T16:00:00+00:00");
    expect(localRow(a, "job", job)).toEqual(server);
    expect(localRow(b, "job", job)).toEqual(server);
  });

  it("never applies a change twice when a response is lost", async () => {
    const a = device("devA", co.tech);
    const { customer } = createJobOffline(a);
    await a.engine.sync();

    a.store.write("customer", customer, co.id, { notes: "dog in yard" });
    a.transport.loseNextResponse = true;
    const lost = await a.engine.sync();
    expect(lost.error).toBe("connection reset");
    expect(lost.pending).toBe(1);

    const retry = await a.engine.sync();
    expect(retry).toMatchObject({ pushed: 1, pending: 0 });

    const audit = await pool.query(
      "select count(*)::int as n from audit_log where row_id = $1 and field = 'notes'",
      [customer],
    );
    expect(audit.rows[0].n).toBe(1);
  });

  it("does not lose unpushed edits when pulling a newer server version", async () => {
    const a = device("devA", co.tech);
    const b = device("devB", co.owner);
    const { customer } = createJobOffline(a);
    await a.engine.sync();
    await b.engine.sync();

    a.store.write("customer", customer, co.id, { notes: "A's unpushed note" });
    b.store.write("customer", customer, co.id, { email: "maria@example.com" });
    await b.engine.sync();

    // Pull only (push is blocked); A keeps its note and gains B's email.
    a.transport.offline = true;
    await a.engine.sync();
    a.transport.offline = false;
    const page = await a.transport.pull(a.store.getCursor(), 500);
    a.store.applyPage(page);
    expect(localRow(a, "customer", customer)).toMatchObject({
      notes: "A's unpushed note",
      email: "maria@example.com",
    });

    await a.engine.sync();
    await b.engine.sync();
    expect(localRow(b, "customer", customer)).toEqual(await serverRow("customer", customer));
    expect((await serverRow("customer", customer))?.notes).toBe("A's unpushed note");
  });

  it("syncs deletes as tombstones", async () => {
    const a = device("devA", co.tech);
    const b = device("devB", co.owner);
    const { customer } = createJobOffline(a);
    await a.engine.sync();
    await b.engine.sync();
    expect(b.store.list("customer").map((r) => r.id)).toContain(customer);

    a.store.softDelete("customer", customer);
    await a.engine.sync();
    await b.engine.sync();
    expect(b.store.list("customer").map((r) => r.id)).not.toContain(customer);
    expect(b.store.get("customer", customer)?.deleted_at).toBeTruthy();
  });

  it("an office edit made after an offline phone edit wins", async () => {
    const a = device("devA", co.tech);
    const { customer } = createJobOffline(a);
    await a.engine.sync();

    a.store.write("customer", customer, co.id, { phone: "phone edit from this morning" });
    await asUser(co.owner, (c) =>
      c.query("update customer set phone = 'office edit this afternoon' where id = $1", [customer]),
    );
    await a.engine.sync();
    expect((await serverRow("customer", customer))?.phone).toBe("office edit this afternoon");
    expect(localRow(a, "customer", customer)?.phone).toBe("office edit this afternoon");
  });

  it("keeps rejected changes as problems and never blocks other work", async () => {
    const a = device("devA", co.tech);
    await a.engine.sync();
    const { customer } = createJobOffline(a);
    const price = a.store.insert("price_book_item", co.id, {
      name: "Tech's own price",
      price_cents: 1,
    });

    const s = await a.engine.sync();
    expect(s.rejected).toBe(1);
    expect(s.pending).toBe(0);
    expect(a.store.problems()).toEqual([
      expect.objectContaining({
        table: "price_book_item",
        rowId: price,
        error: expect.stringContaining("42501"),
      }),
    ]);
    expect(await serverRow("customer", customer)).toBeDefined();
    expect(await serverRow("price_book_item", price)).toBeUndefined();
  });

  it("records every change in the audit log with the device", async () => {
    const a = device("devA", co.tech);
    const { job } = createJobOffline(a);
    a.store.write("job", job, co.id, { summary_notes: "first" });
    await a.engine.sync();
    a.store.write("job", job, co.id, { summary_notes: "second" });
    await a.engine.sync();

    const rows = await pool.query<{
      field: string | null;
      device_id: string;
      user_id: string;
      new_value: unknown;
    }>("select field, device_id, user_id, new_value from audit_log where row_id = $1 order by id", [
      job,
    ]);
    expect(rows.rows[0]).toMatchObject({ field: null, device_id: "devA", user_id: co.tech.id });
    expect(rows.rows.at(-1)).toMatchObject({
      field: "summary_notes",
      device_id: "devA",
      new_value: "second",
    });
  });
});

describe("pull cursor", () => {
  it("pages through everything exactly once", async () => {
    const a = device("devA", co.tech);
    for (let i = 0; i < 25; i++) a.store.insert("customer", co.id, { name: `Bulk ${i}` });
    await a.engine.sync();

    const small = device("devS", co.tech, 7);
    const s = await small.engine.sync();
    const full = device("devF", co.tech, 5000);
    const f = await full.engine.sync();
    expect(s.pulled).toBe(f.pulled);
    expect(small.store.list("customer", { includeDeleted: true }).length).toBe(
      full.store.list("customer", { includeDeleted: true }).length,
    );
  });

  it("never skips a row committed out of order", async () => {
    const d = device("devW", co.tech);
    await d.engine.sync();

    // Transaction 1 starts and writes, but does not commit yet.
    const slow = await pool.connect();
    const fast = await pool.connect();
    try {
      await slow.query("begin");
      const s = await slow.query<{ id: string }>(
        "insert into customer (company_id, name) values ($1, 'slow writer') returning id",
        [co.id],
      );
      // Transaction 2 starts later, writes, and commits first.
      const f = await fast.query<{ id: string }>(
        "insert into customer (company_id, name) values ($1, 'fast writer') returning id",
        [co.id],
      );

      await d.engine.sync();
      // The fast row has a newer transaction id than the open slow one, so the cursor
      // must stop before both; neither may be marked as seen yet.
      expect(d.store.get("customer", s.rows[0]!.id)).toBeUndefined();

      await slow.query("commit");
      await d.engine.sync();
      expect(d.store.get("customer", s.rows[0]!.id)?.name).toBe("slow writer");
      expect(d.store.get("customer", f.rows[0]!.id)?.name).toBe("fast writer");
    } finally {
      slow.release();
      fast.release();
    }
  });

  it("only sends the user's own company", async () => {
    const other = await createCompany();
    const theirs = device("devO", other.tech);
    theirs.store.insert("customer", other.id, { name: "Other company customer" });
    await theirs.engine.sync();

    const mine = device("devM", co.tech);
    await mine.engine.sync();
    const companies = new Set(
      ["customer", "job", "component_type", "company"].flatMap((t) =>
        mine.store.list(t, { includeDeleted: true }).map((r) => r.company_id),
      ),
    );
    expect([...companies]).toEqual([co.id]);
  });
});
