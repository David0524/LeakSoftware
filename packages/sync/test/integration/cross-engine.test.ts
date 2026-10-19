import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { JsonValue } from "../../src";
import {
  asUser,
  createCompany,
  device,
  localRow,
  pool,
  serverRow,
  type TestCompany,
  type TestUser,
} from "./harness";

// A TypeScript phone (this package) and a Swift phone (apps/ios, the iPhone app's engine) on
// the same company and database must end in the same state (docs/plans/swift-app.md). The
// Swift phone is the SundeckSyncDevice program; `pnpm test:db` builds it and sets
// SWIFT_SYNC_DEVICE when Swift is installed.
const binary = process.env.SWIFT_SYNC_DEVICE;

/** The Swift phone, driven one JSON command per line. */
class SwiftPhone {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly replies: AsyncIterator<string>;

  constructor() {
    this.child = spawn(binary!, [], { env: process.env });
    this.child.stderr.on("data", (d) => process.stderr.write(d));
    this.replies = createInterface({ input: this.child.stdout })[Symbol.asyncIterator]();
  }

  async send(command: Record<string, unknown>): Promise<Record<string, JsonValue>> {
    this.child.stdin.write(`${JSON.stringify(command)}\n`);
    const { value, done } = await this.replies.next();
    if (done) throw new Error("The Swift phone stopped");
    const reply = JSON.parse(value) as Record<string, JsonValue>;
    if (typeof reply.failed === "string") throw new Error(`Swift phone: ${reply.failed}`);
    return reply;
  }

  open(name: string, user: TestUser) {
    return this.send({ cmd: "open", name, user });
  }
  async insert(table: string, company: string, values: Record<string, JsonValue>) {
    return (await this.send({ cmd: "insert", table, company, values })).id as string;
  }
  write(table: string, id: string, company: string, values: Record<string, JsonValue>) {
    return this.send({ cmd: "write", table, id, company, values });
  }
  delete(table: string, id: string) {
    return this.send({ cmd: "delete", table, id });
  }
  offline(value: boolean) {
    return this.send({ cmd: "offline", value });
  }
  sync() {
    return this.send({ cmd: "sync" });
  }
  async get(table: string, id: string) {
    const row = (await this.send({ cmd: "get", table, id })).row;
    return (row ?? undefined) as Record<string, JsonValue> | undefined;
  }
  close() {
    this.child.stdin.end();
  }
}

let co: TestCompany;
const phones: SwiftPhone[] = [];

beforeAll(async () => {
  co = await createCompany();
});

afterAll(async () => {
  for (const p of phones) p.close();
  await pool.end();
});

async function swiftPhone(name: string, user: TestUser) {
  const p = new SwiftPhone();
  phones.push(p);
  await p.open(name, user);
  return p;
}

describe.skipIf(!binary)("a TypeScript phone and a Swift phone", () => {
  it("an inspection made offline on the Swift phone arrives intact on the TypeScript phone", async () => {
    const swift = await swiftPhone("swiftA", co.tech);
    const ts = device("tsB", co.owner);
    await swift.sync();
    await ts.engine.sync();

    await swift.offline(true);
    const customer = await swift.insert("customer", co.id, {
      name: "Cross Engine",
      phone: "602-555-0177",
    });
    const property = await swift.insert("property", co.id, {
      customer_id: customer,
      address_line1: "77 Swift Ln",
      has_spa: true,
    });
    const job = await swift.insert("job", co.id, {
      property_id: property,
      bill_to_customer_id: customer,
      status: "in_progress",
      assigned_user_id: co.tech.id,
    });
    const comp = await swift.insert("job_component", co.id, {
      job_id: job,
      component_type_id: co.returnTypeId,
      instance_number: 1,
      label: "Return 1",
    });
    const test = await swift.insert("test_result", co.id, {
      job_id: job,
      job_component_id: comp,
      test_type_id: co.pressureTypeId,
      schema_version: 1,
      data: { line_name: "Return 1", start_psi: 20, end_psi: 12.5, duration_min: 15 },
      outcome: "fail",
    });
    const finding = await swift.insert("finding", co.id, {
      job_id: job,
      job_component_id: comp,
      title: "Return 1 line break",
      severity_key: "major",
      pin_x: 0.42,
      pin_y: 0.18,
    });
    expect(await swift.sync()).toMatchObject({ error: "offline", pending: 6 });

    await swift.offline(false);
    expect(await swift.sync()).toMatchObject({ pushed: 6, rejected: 0, pending: 0, error: null });
    await ts.engine.sync();
    await swift.sync();

    for (const [table, id] of [
      ["customer", customer],
      ["property", property],
      ["job", job],
      ["job_component", comp],
      ["test_result", test],
      ["finding", finding],
    ] as const) {
      const server = await serverRow(table, id);
      expect(server, `${table} on server`).toBeDefined();
      expect(localRow(ts, table, id), `${table} on the TypeScript phone`).toEqual(server);
      expect(await swift.get(table, id), `${table} on the Swift phone`).toEqual(server);
    }
  });

  it("offline edits to one job from both phones resolve per field, newest wins, on both", async () => {
    const swift = await swiftPhone("swiftC", co.tech);
    const ts = device("tsC", co.owner);
    const customer = await swift.insert("customer", co.id, { name: "Both Phones" });
    const property = await swift.insert("property", co.id, {
      customer_id: customer,
      address_line1: "2 Shared Ct",
    });
    const job = await swift.insert("job", co.id, { property_id: property, status: "scheduled" });
    await swift.sync();
    await ts.engine.sync();

    // Both offline. Swift edits the notes first; TypeScript edits them later, and the time.
    await swift.offline(true);
    await swift.write("job", job, co.id, { summary_notes: "Swift: skimmer weir stuck" });
    await new Promise((r) => setTimeout(r, 5));
    ts.store.write("job", job, co.id, {
      summary_notes: "TypeScript: crack by the step",
      scheduled_start: "2026-11-02T16:00:00Z",
    });
    await swift.write("job", job, co.id, { started_at: "2026-11-02T16:05:00Z" });

    // The later edit reaches the server first; the Swift phone's older notes edit loses.
    expect((await ts.engine.sync()).pushed).toBe(1);
    await swift.offline(false);
    await swift.sync();
    await ts.engine.sync();

    const server = await serverRow("job", job);
    expect(server?.summary_notes).toBe("TypeScript: crack by the step");
    expect(server?.started_at).toBe("2026-11-02T16:05:00+00:00");
    expect(server?.scheduled_start).toBe("2026-11-02T16:00:00+00:00");
    expect(localRow(ts, "job", job)).toEqual(server);
    expect(await swift.get("job", job)).toEqual(server);
  });

  it("a delete and an office edit from elsewhere reach the Swift phone", async () => {
    const swift = await swiftPhone("swiftD", co.tech);
    const ts = device("tsD", co.owner);
    const keep = ts.store.insert("customer", co.id, { name: "Stays" });
    const gone = ts.store.insert("customer", co.id, { name: "Goes" });
    await ts.engine.sync();
    await swift.sync();
    expect(await swift.get("customer", gone)).toMatchObject({ name: "Goes" });

    ts.store.softDelete("customer", gone);
    await ts.engine.sync();
    await asUser(co.owner, (c) =>
      c.query("update customer set phone = '480-555-0161' where id = $1", [keep]),
    );
    await swift.sync();
    expect((await swift.get("customer", gone))?.deleted_at).toBeTruthy();
    expect(await swift.get("customer", keep)).toEqual(await serverRow("customer", keep));

    const devices = await pool.query<{ device_id: string }>(
      "select distinct device_id from audit_log where row_id = any($1::uuid[]) and device_id is not null",
      [[keep, gone]],
    );
    expect(devices.rows.map((r) => r.device_id)).toEqual(["tsD"]);
  });
});
