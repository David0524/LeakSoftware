import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const notify = vi.fn<(...args: unknown[]) => Promise<{ sent: number }>>(async () => ({ sent: 1 }));
vi.mock("../src/server/push", () => ({
  notify: (...args: unknown[]) => notify(...args),
  shopManagers: async () => ["owner-1", "admin-1"],
}));

const { runChemistryAlerts, SETTLE_MINUTES } = await import("../src/server/chemistry-alerts");

// Out-of-range alerts (docs/design/2026-11-16-chemistry-trends.md): once per reading of a log
// entry, to the shop's owners and admins, for readings well outside their range only.

const now = new Date("2026-11-16T15:00:00Z");

const entry = (o: object) => ({
  id: "r1",
  company_id: "c1",
  property_id: "p1",
  job_id: "j1",
  recorded_at: "2026-11-16T13:00:00Z",
  fc: null,
  ph: null,
  ta: null,
  ch: null,
  cya: null,
  salt: null,
  goals: null,
  ...o,
});

/** A client over a few tables: reads answer what the test set, writes are recorded. */
function fakeDb(rows: object[], alerted: { reading_id: string; reading_key: string }[] = []) {
  const claimedKeys: string[] = [];
  const window: { gte?: string; lte?: string } = {};
  const table = (t: string) => {
    const q: Record<string, unknown> = {};
    let inserting: { reading_key: string }[] | null = null;
    let result: unknown[] | null = null;
    q.select = () => q;
    q.is = () => q;
    q.in = () => q;
    q.eq = (_: string, id: string) => {
      if (t === "chemical_alert")
        result = alerted
          .filter((a) => a.reading_id === id)
          .map((a) => ({ reading_key: a.reading_key }));
      return q;
    };
    q.gte = (_: string, v: string) => ((window.gte = v), q);
    q.lte = (_: string, v: string) => ((window.lte = v), q);
    q.order = () => q;
    q.limit = () => q;
    q.upsert = (r: { reading_key: string }[]) => {
      inserting = r;
      claimedKeys.push(...r.map((x) => x.reading_key));
      return q;
    };
    q.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve({
        data:
          inserting ??
          (t === "chemical_reading"
            ? rows
            : t === "property"
              ? [{ id: "p1", customer: { name: "Rebecca Soto" } }]
              : (result ?? [])),
        error: null,
      }).then(ok);
    return q;
  };
  return { client: { from: table } as never, claimedKeys, window };
}

describe("runChemistryAlerts", () => {
  beforeEach(() => notify.mockClear());

  it("tells the owners and admins once about each reading far outside its range", async () => {
    const { client, claimedKeys } = fakeDb([entry({ fc: 0.5, ph: 8.2, ta: 100 })]);
    const run = await runChemistryAlerts(client, now);
    expect(run).toEqual({ entries: 1, alerts: 2, sent: 1 });
    expect(claimedKeys).toEqual(["fc", "ph"]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(client, {
      userIds: ["owner-1", "admin-1"],
      kind: "chemistry",
      text: {
        title: "Out-of-range readings",
        body: "Rebecca Soto: Free chlorine 0.5 low (aim 3–6), pH 8.2 high (aim 7.4–7.6)",
      },
      data: { job: "j1" },
    });
  });

  it("leaves out readings already alerted, and sends nothing when all were", async () => {
    const db = fakeDb([entry({ fc: 0.5, ph: 8.2 })], [{ reading_id: "r1", reading_key: "fc" }]);
    await runChemistryAlerts(db.client, now);
    expect(db.claimedKeys).toEqual(["ph"]);
    expect(notify.mock.calls[0]![1]).toMatchObject({
      text: { title: "Out-of-range reading", body: expect.stringContaining("pH 8.2 high") },
    });
    notify.mockClear();
    const again = fakeDb([entry({ fc: 0.5 })], [{ reading_id: "r1", reading_key: "fc" }]);
    expect(await runChemistryAlerts(again.client, now)).toEqual({
      entries: 1,
      alerts: 0,
      sent: 0,
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it("ignores readings only a little outside the range, or in range", async () => {
    const { client, claimedKeys } = fakeDb([entry({ fc: 2.5, ph: 7.7, ta: 70, ch: 160, cya: 25 })]);
    expect(await runChemistryAlerts(client, now)).toEqual({ entries: 0, alerts: 0, sent: 0 });
    expect(claimedKeys).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });

  it("judges by the level the tech aimed for", async () => {
    const { client, claimedKeys } = fakeDb([entry({ fc: 2.5, goals: { fc: 6 } })]);
    await runChemistryAlerts(client, now);
    expect(claimedKeys).toEqual(["fc"]);
  });

  it("looks at entries that have sat for a while, from the last few days", async () => {
    const db = fakeDb([]);
    await runChemistryAlerts(db.client, now);
    expect(db.window.lte).toBe(new Date(now.getTime() - SETTLE_MINUTES * 60_000).toISOString());
    expect(db.window.gte).toBe("2026-11-13T15:00:00.000Z");
  });

  it("opens the pool for an entry taken outside a visit", async () => {
    const { client } = fakeDb([entry({ job_id: null, ph: 8.4 })]);
    await runChemistryAlerts(client, now);
    expect(notify.mock.calls[0]![1]).toMatchObject({ data: { property: "p1" } });
  });
});
