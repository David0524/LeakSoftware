import { beforeEach, describe, expect, it, vi } from "vitest";

const routing = { routingConfigured: vi.fn(() => true), geocodeAddress: vi.fn() };
vi.mock("@/server/routing", () => routing);

const { loadStarts, locateHomeWith, saveMemberStartWith } =
  await import("../src/server/member-start");

interface Row {
  id: string;
  company_id: string;
  user_id: string;
  start_from: string;
  home_address: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  home_geocoded_address: string | null;
  deleted_at: string | null;
}

/**
 * A member_start table in memory: select with eq/is filters, update with eq/is, insert. The
 * address trigger is mirrored (a changed address drops its coordinates).
 */
function table(rows: Row[]) {
  const writes: { kind: string; values: Record<string, unknown> }[] = [];
  const matches = (filters: [string, unknown][]) => (r: Row) =>
    filters.every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v);
  const db = {
    from: (name: string) => {
      expect(name).toBe("member_start");
      const filters: [string, unknown][] = [];
      let op: "select" | "update" = "select";
      let values: Record<string, unknown> = {};
      const run = () => {
        const hit = rows.filter(matches(filters));
        if (op === "update") {
          writes.push({ kind: "update", values });
          for (const r of hit) {
            const changed = "home_address" in values && values.home_address !== r.home_address;
            Object.assign(r, values);
            if (changed && !("home_latitude" in values))
              Object.assign(r, {
                home_latitude: null,
                home_longitude: null,
                home_geocoded_address: null,
              });
          }
          return { data: null, error: null };
        }
        return { data: hit, error: null };
      };
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push([k, v]), q),
        is: (k: string, v: unknown) => (filters.push([k, v]), q),
        update: (v: Record<string, unknown>) => ((op = "update"), (values = v), q),
        insert: (v: Record<string, unknown>) => {
          writes.push({ kind: "insert", values: v });
          rows.push({
            home_address: null,
            home_latitude: null,
            home_longitude: null,
            home_geocoded_address: null,
            deleted_at: null,
            ...(v as Partial<Row>),
          } as Row);
          return Promise.resolve({ data: null, error: null });
        },
        maybeSingle: () => Promise.resolve({ data: run().data?.[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
          Promise.resolve(run()).then(ok, bad),
      };
      return q;
    },
  };
  return { db: db as never, rows, writes };
}

const row = (over: Partial<Row> = {}): Row => ({
  id: "s1",
  company_id: "c1",
  user_id: "u1",
  start_from: "home",
  home_address: "12 Elm St, Mesa, AZ 85201",
  home_latitude: null,
  home_longitude: null,
  home_geocoded_address: null,
  deleted_at: null,
  ...over,
});

beforeEach(() => {
  routing.routingConfigured.mockReset().mockReturnValue(true);
  routing.geocodeAddress.mockReset();
});

describe("locateHomeWith (a home address on the map)", () => {
  it("finds a new address and keeps the coordinates with it", async () => {
    const t = table([row({ home_address: "  12 Elm St,   Mesa, AZ 85201 " })]);
    routing.geocodeAddress.mockResolvedValue({ lat: 33.4, lng: -111.8 });
    expect(await locateHomeWith(t.db, "c1", "u1")).toEqual({ lat: 33.4, lng: -111.8 });
    // Looked up and kept in the tidied form (core homeLookupAddress).
    expect(routing.geocodeAddress).toHaveBeenCalledWith(t.db, "c1", "12 Elm St, Mesa, AZ 85201");
    expect(t.rows[0]).toMatchObject({
      home_latitude: 33.4,
      home_longitude: -111.8,
      home_geocoded_address: "12 Elm St, Mesa, AZ 85201",
    });
  });

  it("keeps a miss with its address, so the same address isn't tried again", async () => {
    const t = table([row()]);
    routing.geocodeAddress.mockResolvedValue(null);
    expect(await locateHomeWith(t.db, "c1", "u1")).toBeNull();
    expect(t.rows[0]).toMatchObject({
      home_latitude: null,
      home_geocoded_address: "12 Elm St, Mesa, AZ 85201",
    });
    routing.geocodeAddress.mockClear();
    expect(await locateHomeWith(t.db, "c1", "u1")).toBeNull();
    expect(routing.geocodeAddress).not.toHaveBeenCalled();
  });

  it("does nothing without a row, an address, or the routing service", async () => {
    expect(await locateHomeWith(table([]).db, "c1", "u1")).toBeNull();
    expect(await locateHomeWith(table([row({ home_address: " " })]).db, "c1", "u1")).toBeNull();
    routing.routingConfigured.mockReturnValue(false);
    expect(await locateHomeWith(table([row()]).db, "c1", "u1")).toBeNull();
    expect(routing.geocodeAddress).not.toHaveBeenCalled();
  });

  it("only looks up the person named, in their shop", async () => {
    const t = table([row({ user_id: "u2" }), row({ id: "s3", company_id: "c2" })]);
    expect(await locateHomeWith(t.db, "c1", "u1")).toBeNull();
    expect(routing.geocodeAddress).not.toHaveBeenCalled();
  });
});

describe("saveMemberStartWith (Start My Day From)", () => {
  const me = { companyId: "c1", actorId: "u1", manager: false };

  it("adds your row with Home and looks the address up", async () => {
    const t = table([]);
    routing.geocodeAddress.mockResolvedValue({ lat: 33.4, lng: -111.8 });
    const r = await saveMemberStartWith(t.db, me, {
      userId: "",
      startFrom: "home",
      homeAddress: "12 Elm St, Mesa, AZ 85201",
    });
    expect(r).toEqual({ saved: { found: true } });
    expect(t.writes[0]).toMatchObject({
      kind: "insert",
      values: { company_id: "c1", user_id: "u1", start_from: "home" },
    });
    expect(t.rows[0]).toMatchObject({ home_latitude: 33.4, home_longitude: -111.8 });
  });

  it("says when Home's address isn't found (the day starts at the shop until it is)", async () => {
    const t = table([row({ start_from: "shop", home_address: null })]);
    routing.geocodeAddress.mockResolvedValue(null);
    expect(
      await saveMemberStartWith(t.db, me, {
        userId: "u1",
        startFrom: "home",
        homeAddress: "1 Nowhere Rd",
      }),
    ).toEqual({ saved: { found: false } });
    expect(t.writes[0]).toMatchObject({ kind: "update" });
  });

  it("keeps the address and its pin when switching to The Shop", async () => {
    const found = row({
      home_latitude: 33.4,
      home_longitude: -111.8,
      home_geocoded_address: "12 Elm St, Mesa, AZ 85201",
    });
    const t = table([found]);
    expect(
      await saveMemberStartWith(t.db, me, {
        userId: "",
        startFrom: "shop",
        homeAddress: found.home_address!,
      }),
    ).toEqual({ saved: { found: null } });
    expect(t.rows[0]).toMatchObject({ start_from: "shop", home_latitude: 33.4 });
    expect(routing.geocodeAddress).not.toHaveBeenCalled();
  });

  it("asks for an address with Home, and refuses other choices", async () => {
    const t = table([]);
    expect(
      await saveMemberStartWith(t.db, me, { userId: "", startFrom: "home", homeAddress: " " }),
    ).toEqual({ fields: { home_address: "Enter the home address." } });
    expect(
      (await saveMemberStartWith(t.db, me, { userId: "", startFrom: "car", homeAddress: "" }))
        .error,
    ).toBeTruthy();
    expect(
      (
        await saveMemberStartWith(t.db, me, {
          userId: "",
          startFrom: "home",
          homeAddress: "x".repeat(401),
        })
      ).fields,
    ).toBeTruthy();
    expect(t.writes).toEqual([]);
  });

  it("lets only owners and admins set someone else's", async () => {
    const t = table([]);
    const them = { userId: "u2", startFrom: "shop", homeAddress: "" };
    expect((await saveMemberStartWith(t.db, me, them)).error).toMatch(/owners and admins/);
    expect(t.writes).toEqual([]);
    expect(await saveMemberStartWith(t.db, { ...me, manager: true }, them)).toEqual({
      saved: { found: null },
    });
    expect(t.rows[0]).toMatchObject({ user_id: "u2", start_from: "shop" });
  });
});

describe("loadStarts (who routes with whose start)", () => {
  const rows = [row(), row({ id: "s2", user_id: "u2" }), row({ id: "s3", company_id: "c2" })];

  it("gives owners and admins everyone's in the shop, and a tech only their own", async () => {
    const all = await loadStarts(table(rows.map((r) => ({ ...r }))).db, "c1", {
      userId: "u1",
      manager: true,
    });
    expect(all.map((r) => r.id)).toEqual(["s1", "s2"]);
    const own = await loadStarts(table(rows.map((r) => ({ ...r }))).db, "c1", {
      userId: "u2",
      manager: false,
    });
    expect(own.map((r) => r.id)).toEqual(["s2"]);
  });
});
