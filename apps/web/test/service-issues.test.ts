import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { convertIssueWith, notifyIssuesWith, IssueError } =
  await import("../src/server/service-issues");

type Row = Record<string, unknown>;

/**
 * Tables in memory behind the bits of the Supabase client the conversion uses: select, update
 * and insert with eq/is/in filters, maybeSingle, and create_job (which records its arguments).
 */
function fakeDb(tables: Record<string, Row[]>) {
  const calls: { kind: string; table: string; values?: unknown }[] = [];
  const db = {
    rpc: vi.fn(async (name: string, args: Row) => {
      calls.push({ kind: "rpc", table: name, values: args });
      const id = "new-job";
      (tables.job ??= []).push({ id, ...(args.job as Row) });
      return { data: id, error: null };
    }),
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let op: "select" | "update" | "insert" = "select";
      let values: Row | Row[] = {};
      let returning = false;
      const rows = () => (tables[table] ??= []);
      const run = () => {
        if (op === "insert") {
          const list = Array.isArray(values) ? values : [values];
          calls.push({ kind: "insert", table, values: list });
          rows().push(...list);
          return { data: null, error: null };
        }
        const hit = rows().filter((r) => filters.every((f) => f(r)));
        if (op === "update") {
          calls.push({ kind: "update", table, values });
          hit.forEach((r) => Object.assign(r, values));
          return { data: returning ? hit : null, error: null };
        }
        return { data: hit, error: null };
      };
      const q = {
        select: () => {
          if (op === "update") returning = true;
          return q;
        },
        eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
        neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), q),
        is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), q),
        in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), q),
        update: (v: Row) => ((op = "update"), (values = v), q),
        insert: (v: Row | Row[]) => ((op = "insert"), (values = v), q),
        maybeSingle: async () => {
          const r = run();
          return { data: (r.data as Row[] | null)?.[0] ?? null, error: null };
        },
        then: (resolve: (v: unknown) => unknown) => resolve(run()),
      };
      return q;
    },
  };
  return { db: db as never, calls };
}

const base = () => ({
  service_issue: [
    {
      id: "issue",
      company_id: "co",
      customer_id: "cust",
      property_id: "pool",
      job_id: "visit",
      description: "Cracked skimmer throat",
      status: "open",
      reported_by: "tech",
      notified_at: null,
    },
  ],
  media: [
    {
      id: "m1",
      company_id: "co",
      job_id: "visit",
      service_issue_id: "issue",
      kind: "photo",
      storage_path: "co/visit/m1.jpg",
      upload_state: "uploaded",
      captured_at: "2026-11-16T15:00:00Z",
    },
    { id: "m2", company_id: "co", job_id: "visit", service_issue_id: null, kind: "photo" },
  ] as Row[],
  component_type: [
    {
      id: "ct-skimmer",
      company_id: "co",
      key: "skimmer",
      name: "Skimmer",
      job_type: "detection",
      active: true,
      allows_multiple: true,
      default_count: 1,
      applies_to: "pool",
      sort_order: 1,
    },
  ] as Row[],
  property: [{ id: "pool", has_spa: false, pool_type: "gunite_plaster" }] as Row[],
});

describe("Make Quote", () => {
  it("makes a repair job for the pool, converts the issue, and copies its photos", async () => {
    const tables = base();
    const { db, calls } = fakeDb(tables);
    const job = await convertIssueWith(db, {
      companyId: "co",
      issueId: "issue",
      type: "repair",
      userId: "owner",
      now: "2026-11-16T17:00:00Z",
    });
    expect(job).toBe("new-job");
    // The job first, for the issue's customer and pool, with no checklist.
    const rpc = calls.find((c) => c.kind === "rpc")!.values as Row;
    expect(rpc).toMatchObject({
      target_company: "co",
      existing_customer: "cust",
      existing_property: "pool",
      new_customer: null,
      new_property: null,
      components: [],
      job: {
        type: "repair",
        property_id: "pool",
        bill_to_customer_id: "cust",
        status: "unscheduled",
        summary_notes: "Cracked skimmer throat",
      },
    });
    // Then the issue, then the photo copied onto the job (the same file).
    expect(calls.map((c) => `${c.kind}:${c.table}`)).toEqual([
      "rpc:create_job",
      "update:service_issue",
      "insert:media",
    ]);
    expect(tables.service_issue[0]).toMatchObject({
      status: "converted",
      converted_job_id: "new-job",
      resolved_by: "owner",
      resolved_at: "2026-11-16T17:00:00Z",
    });
    const copies = tables.media.filter((m) => m.job_id === "new-job");
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({
      company_id: "co",
      service_issue_id: "issue",
      storage_path: "co/visit/m1.jpg",
      upload_state: "uploaded",
      kind: "photo",
    });
    expect(copies[0]!.id).not.toBe("m1");
  });

  it("gives Make Leak Detection Job the pool's checklist", async () => {
    const { db, calls } = fakeDb(base());
    await convertIssueWith(db, {
      companyId: "co",
      issueId: "issue",
      type: "detection",
      userId: "o",
    });
    const rpc = calls.find((c) => c.kind === "rpc")!.values as Row;
    expect((rpc.job as Row).type).toBe("detection");
    expect((rpc.components as Row[]).map((c) => c.component_type_id)).toEqual(["ct-skimmer"]);
  });

  it("refuses an issue that isn't open, or isn't there", async () => {
    const tables = base();
    tables.service_issue[0]!.status = "resolved";
    const { db, calls } = fakeDb(tables);
    await expect(
      convertIssueWith(db, { companyId: "co", issueId: "issue", type: "repair", userId: "o" }),
    ).rejects.toThrow(IssueError);
    await expect(
      convertIssueWith(db, { companyId: "other", issueId: "issue", type: "repair", userId: "o" }),
    ).rejects.toThrow("Issue not found.");
    expect(calls).toEqual([]);
  });
});

describe("telling the office", () => {
  it("notifies the owners and admins once, not the reporter", async () => {
    const tables = {
      ...base(),
      membership: [
        { company_id: "co", user_id: "owner", role: "owner", status: "active", deleted_at: null },
        { company_id: "co", user_id: "tech", role: "tech", status: "active", deleted_at: null },
        { company_id: "co", user_id: "admin", role: "admin", status: "active", deleted_at: null },
      ],
      customer: [{ id: "cust", name: "Rebecca Soto" }],
    };
    const { db } = fakeDb(tables);
    const send = vi.fn(async () => undefined);
    expect(await notifyIssuesWith(db, send, { companyId: "co", ids: ["issue", "issue"] })).toBe(1);
    expect(send).toHaveBeenCalledWith({
      userIds: ["owner", "admin"],
      text: { title: "Issue reported", body: "Rebecca Soto: Cracked skimmer throat" },
      data: { issue: "issue", job: "visit" },
    });
    // Asked again (another sync): already told.
    expect(await notifyIssuesWith(db, send, { companyId: "co", ids: ["issue"] })).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
