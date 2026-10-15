import { describe, expect, it } from "vitest";
import { LocalStore, type PullPage } from "../src";
import { memoryDb } from "./sqlite";

const C = "00000000-0000-4000-8000-0000000000c1";

function store(start = 1_800_000_000_000) {
  let t = start;
  const s = LocalStore.open(memoryDb(), { deviceId: "dev1", now: () => t++ });
  return s;
}

describe("LocalStore", () => {
  it("keeps the device id and clock across reopen", () => {
    const db = memoryDb();
    const a = LocalStore.open(db, { now: () => 5 });
    a.insert("customer", C, { name: "A" });
    const b = LocalStore.open(db, { now: () => 1 });
    expect(b.deviceId).toBe(a.deviceId);
    expect(b.clock.state.ms).toBe(5);
  });

  it("writes rows and outbox entries together", () => {
    const s = store();
    const id = s.insert("customer", C, { name: "Maria" });
    s.write("customer", id, C, { phone: "555" });
    expect(s.get("customer", id)).toMatchObject({ id, company_id: C, name: "Maria", phone: "555" });
    expect(s.pendingCount()).toBe(2);
  });

  it("drops jobs that aged off phones with everything under them, unless unsent", () => {
    const s = store();
    const row = (table: string, r: Record<string, unknown>) => ({
      xid: "1",
      table,
      row: { company_id: C, ...r } as never,
    });
    s.applyPage({
      rows: [
        row("job", { id: "old", status: "done" }),
        row("job_component", { id: "jc", job_id: "old" }),
        row("quote", { id: "q", job_id: "old" }),
        row("quote_line_item", { id: "ql", quote_id: "q" }),
        row("invoice", { id: "i", job_id: "old" }),
        row("payment", { id: "pay", invoice_id: "i" }),
        row("warranty", { id: "w", repair_job_id: "old" }),
        row("customer", { id: "cu" }),
        row("job", { id: "kept", status: "done" }),
        row("job_component", { id: "jc2", job_id: "kept" }),
      ],
      done: true,
      cursor: {},
      server_hlc: "1800000000000-0000-server",
    });
    // An unsent change inside the second job keeps it on the phone.
    s.write("job_component", "jc2", C, { label: "Edited offline" });

    expect(s.pruneJobs(() => false)).toBe(1);
    for (const [t, id] of [
      ["job", "old"],
      ["job_component", "jc"],
      ["quote", "q"],
      ["quote_line_item", "ql"],
      ["invoice", "i"],
      ["payment", "pay"],
      ["warranty", "w"],
    ])
      expect(s.get(t!, id!)).toBeUndefined();
    expect(s.get("customer", "cu")).toBeDefined();
    expect(s.get("job", "kept")).toBeDefined();
    expect(s.get("job_component", "jc2")).toBeDefined();
  });

  it("tells screens which tables changed, so others are not re-read", () => {
    const s = store();
    const jobs = s.tableVersion("job");
    const results = s.tableVersion("checklist_item_result");
    s.insert("checklist_item_result", C, { job_id: "j", status: "inspected" });
    expect(s.tableVersion("job")).toBe(jobs);
    expect(s.tableVersion("checklist_item_result")).not.toBe(results);

    s.applyPage({
      rows: [{ xid: "1", table: "job", row: { id: "j1", company_id: C, status: "done" } }],
      done: true,
      cursor: {},
      server_hlc: "1800000000000-0000-server",
    });
    expect(s.tableVersion("job")).not.toBe(jobs);

    const customers = s.tableVersion("customer");
    s.clearAll();
    expect(s.tableVersion("customer")).not.toBe(customers);
  });

  it("refuses server-managed columns", () => {
    const s = store();
    expect(() => s.insert("customer", C, { company_id: "x" })).toThrow(/managed by the server/);
  });

  it("merges outbox entries per row, keeping the newest value per field", () => {
    const s = store();
    const id = s.insert("customer", C, { name: "First", phone: "1" });
    s.write("customer", id, C, { name: "Second" });
    const job = s.insert("job", C, { property_id: "p" });
    const batch = s.pendingBatch(10);
    expect(batch.mutations.map((m) => m.table)).toEqual(["customer", "job"]);
    const m = batch.mutations[0]!;
    expect(m.fields.name!.v).toBe("Second");
    expect(m.fields.phone!.v).toBe("1");
    expect(batch.seqsByMutation.get(m.id)).toHaveLength(2);
    expect(batch.mutations[1]!.row_id).toBe(job);
  });

  it("limits a batch by rows, never splitting one row across batches", () => {
    const s = store();
    const a = s.insert("customer", C, { name: "a" });
    s.insert("customer", C, { name: "b" });
    s.write("customer", a, C, { phone: "later" });
    const batch = s.pendingBatch(1);
    expect(batch.mutations).toHaveLength(1);
    expect(Object.keys(batch.mutations[0]!.fields).sort()).toEqual(["name", "phone"]);
  });

  it("acknowledged changes leave the outbox; rejected ones are kept as problems", () => {
    const s = store();
    s.insert("customer", C, { name: "a" });
    s.insert("quote", C, { status: "accepted" });
    const b = s.pendingBatch(10);
    s.acknowledge(b.seqsByMutation.get(b.mutations[0]!.id)!);
    s.reject(b.seqsByMutation.get(b.mutations[1]!.id)!, "42501 field quote.status is not writable");
    expect(s.pendingCount()).toBe(0);
    expect(s.problems()).toEqual([
      expect.objectContaining({
        table: "quote",
        fields: ["status"],
        error: expect.stringContaining("42501"),
      }),
    ]);
    expect(s.pendingBatch(10).mutations).toHaveLength(0);
  });

  it("lays unpushed local edits over pulled rows", () => {
    const s = store();
    const id = s.insert("customer", C, { name: "Local" });
    const page: PullPage = {
      rows: [
        { table: "customer", xid: "9", row: { id, company_id: C, name: "Server", phone: "555" } },
      ],
      done: true,
      cursor: { from: "10" },
      server_hlc: "1900000000000-0000-server",
    };
    s.applyPage(page);
    expect(s.get("customer", id)).toMatchObject({ name: "Local", phone: "555" });
    expect(s.getCursor()).toEqual({ from: "10" });
    expect(s.clock.state.ms).toBe(1900000000000);
  });

  it("soft deletes hide rows from lists but keep them", () => {
    const s = store();
    const id = s.insert("customer", C, { name: "Gone" });
    s.softDelete("customer", id);
    expect(s.list("customer")).toHaveLength(0);
    expect(s.list("customer", { includeDeleted: true })).toHaveLength(1);
  });
});
