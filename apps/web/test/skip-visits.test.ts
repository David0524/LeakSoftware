import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const notifyMock = vi.fn();
vi.mock("../src/server/push", () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
  shopManagers: async () => ["owner", "admin", "alex"],
}));

const { notifySkips, runSkipVisits } = await import("../src/server/skip-visits");

type Row = {
  job_id: string;
  company_id: string;
  customer: string | null;
  skip_reason: string | null;
  skipped_by: string | null;
};

/** A client answering the two skip functions and the profile read. */
function db(opts: { skipped?: number; toNotify?: Row[]; error?: string }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      if (opts.error && fn === "auto_skip_visits")
        return { data: null, error: { message: opts.error } };
      if (fn === "auto_skip_visits")
        return {
          data: Array.from({ length: opts.skipped ?? 0 }, (_, i) => ({ job_id: `j${i}` })),
          error: null,
        };
      return { data: opts.toNotify ?? [], error: null };
    },
    from: () => ({
      select: () => ({
        in: async () => ({ data: [{ id: "alex", full_name: "Alex Kim" }] }),
      }),
    }),
  };
  return { calls, client: client as never };
}

const manual: Row = {
  job_id: "j1",
  company_id: "c1",
  customer: "Rebecca Soto",
  skip_reason: "Dog in Yard",
  skipped_by: "alex",
};
const auto = (id: string): Row => ({
  ...manual,
  job_id: id,
  skipped_by: null,
  skip_reason: "Not Done",
});

describe("telling owners about skips", () => {
  beforeEach(() => notifyMock.mockReset().mockResolvedValue({ sent: 1 }));

  it("pushes a skip to the owners and admins, not the tech who skipped it", async () => {
    const { client, calls } = db({ toNotify: [manual] });
    expect(await notifySkips(client, "j1")).toEqual({ notified: 1, visits: 1 });
    expect(calls[0]).toEqual({ fn: "skips_to_notify", args: { only_job: "j1" } });
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock.mock.calls[0]![1]).toEqual({
      userIds: ["owner", "admin"],
      kind: "skip",
      text: { title: "Visit skipped", body: "Rebecca Soto: Dog in Yard, skipped by Alex." },
      data: { job: "j1" },
    });
  });

  it("sends one digest per shop for the day-end skips", async () => {
    const { client } = db({ toNotify: [auto("a"), auto("b"), auto("c")] });
    const r = await notifySkips(client);
    expect(r.visits).toBe(3);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock.mock.calls[0]![1]).toMatchObject({
      userIds: ["owner", "admin", "alex"],
      kind: "skip",
      text: { title: "3 visits weren’t done" },
    });
  });

  it("says nothing when nothing is waiting", async () => {
    const { client } = db({ toNotify: [] });
    expect(await notifySkips(client)).toEqual({ notified: 0, visits: 0 });
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe("the daily day-end skip", () => {
  beforeEach(() => notifyMock.mockReset().mockResolvedValue({ sent: 2 }));

  it("skips what the database says is due, as of the run's time, then tells the owners", async () => {
    const at = new Date("2026-11-16T15:45:00Z");
    const { client, calls } = db({ skipped: 2, toNotify: [auto("a"), auto("b")] });
    expect(await runSkipVisits(client, at)).toEqual({ skipped: 2, notified: 2 });
    expect(calls.map((c) => c.fn)).toEqual(["auto_skip_visits", "skips_to_notify"]);
    expect(calls[0]!.args).toEqual({ at: "2026-11-16T15:45:00.000Z" });
  });

  it("reports a database error instead of throwing", async () => {
    const { client } = db({ error: "boom" });
    expect(await runSkipVisits(client)).toEqual({ error: "boom" });
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
