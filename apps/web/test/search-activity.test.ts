import { beforeEach, describe, expect, it, vi } from "vitest";

// Search and Activity on the website (docs/plans/search-and-activity.md).

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  getOffice: async () => ({
    user: { id: "u1", email: "o@x.test", name: "Owner" },
    company: { id: "c1", name: "Blue Pools", role: "owner", timezone: "America/Phoenix" },
    companies: [],
    isOwner: true,
    isManager: true,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: (name: string, args: unknown) => rpc(name, args) }),
}));

const { searchOffice } = await import("../src/app/actions/search");
const { moreActivity, markActivitySeen } = await import("../src/app/actions/activity");
const { activityUnread } = await import("../src/lib/activity");
const { desktopNav, officeLinks } = await import("../src/lib/nav");
const recent = await import("../src/lib/recent");

describe("searchOffice", () => {
  beforeEach(() => rpc.mockReset());

  it("asks the database through the person's own access, then ranks with the shared rule", async () => {
    rpc.mockResolvedValue({
      data: {
        customers: [{ id: "a", name: "Sam Ochoa", phone: "(602) 555-0142" }],
        jobs: [
          { id: "j2", number: 10380, type: "repair", customer_name: "Lee" },
          { id: "j1", number: 1038, type: "detection", customer_name: "Sam Ochoa" },
        ],
      },
      error: null,
    });
    const r = await searchOffice("#1038");
    expect(rpc).toHaveBeenCalledWith("search_candidates", {
      target_company: "c1",
      words: ["1038"],
      digits: "1038",
    });
    expect(r.groups.map((g) => [g.key, g.hits.map((h) => h.id)])).toEqual([["jobs", ["j1", "j2"]]]);
  });

  it("doesn't ask before two characters", async () => {
    const r = await searchOffice("s");
    expect(rpc).not.toHaveBeenCalled();
    expect(r).toMatchObject({ groups: [], empty: false });
  });

  it("See All returns the whole group", async () => {
    rpc.mockResolvedValue({
      data: {
        customers: Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, name: `Smith ${i}` })),
      },
      error: null,
    });
    expect((await searchOffice("smith")).groups[0]!.hits).toHaveLength(5);
    expect((await searchOffice("smith", "customers")).groups[0]!.hits).toHaveLength(8);
  });

  it("fails loudly when the database does", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(searchOffice("smith")).rejects.toThrow("boom");
  });
});

describe("Activity", () => {
  beforeEach(() => rpc.mockReset());

  it("pages after the last event", async () => {
    rpc.mockResolvedValue({ data: { events: [{ id: "e" }], more: true }, error: null });
    const id = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
    expect(await moreActivity({ at: "2026-10-20T16:00:00Z", id })).toEqual({
      events: [{ id: "e" }],
      more: true,
    });
    expect(rpc).toHaveBeenCalledWith("activity_feed", {
      target_company: "c1",
      before_at: "2026-10-20T16:00:00Z",
      before_id: id,
      page_size: 50,
    });
    expect(await moreActivity({ at: "nope", id: "x" })).toEqual({ events: [], more: false });
  });

  it("marks it seen, and reads the dot (none when the database can't say)", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await markActivitySeen();
    expect(rpc).toHaveBeenCalledWith("mark_activity_seen", undefined);
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await activityUnread({ company: { id: "c1" } } as never)).toBe(true);
  });

  it("sits under More with its dot, on phones and in the desktop menu", () => {
    const links = officeLinks(true, {}, 0, true);
    expect(links.map((l) => l.href)).toEqual([
      "/today",
      "/jobs",
      "/schedule",
      "/messages",
      "/customers",
      "/invoices",
      "/activity",
      "/dashboard",
      "/chemicals",
      "/settings",
    ]);
    expect(links.find((l) => l.href === "/activity")?.dot).toBe(true);
    expect(desktopNav(links).more.map((l) => l.href)).toEqual([
      "/customers",
      "/invoices",
      "/activity",
      "/chemicals",
    ]);
  });
});

describe("Recent", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  const item = (id: string) => ({
    kind: "job" as const,
    id,
    title: `Job #${id}`,
    detail: null,
    open: { screen: "job" as const, id },
  });

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", storage);
  });

  it("keeps each person's on this browser, and signing out forgets them all", () => {
    recent.saveRecent("u1", item("1"));
    recent.saveRecent("u1", item("2"));
    recent.saveRecent("u2", item("3"));
    expect(recent.loadRecent("u1").map((r) => r.id)).toEqual(["2", "1"]);
    recent.clearRecent("u1");
    expect(recent.loadRecent("u1")).toEqual([]);
    store.set("other", "x");
    recent.forgetAllRecent();
    expect([...store.keys()]).toEqual(["other"]);
  });

  it("works without storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(recent.loadRecent("u1")).toEqual([]);
    expect(recent.saveRecent("u1", item("1")).map((r) => r.id)).toEqual(["1"]);
    expect(() => recent.forgetAllRecent()).not.toThrow();
  });

  it("opens the right screen", () => {
    expect(recent.openHref({ screen: "customer", id: "c" })).toBe("/customers/c");
    expect(recent.openHref({ screen: "job", id: "j", section: "invoice" })).toBe("/jobs/j#invoice");
  });
});
