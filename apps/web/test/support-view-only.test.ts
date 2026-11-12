import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));

// View Only support sessions (security review, 2026-11-12): the website's own changes are
// refused whatever shop cookie the request carries, unless staff really belong to that shop.
const SUPPORT_SHOP = "shop-x";
let session: { access: "view" | "edit" } | null = null;
let memberships: string[] = [];

function query(table: string) {
  const filters: Record<string, unknown> = {};
  const q = {
    select: () => q,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return q;
    },
    is: () => q,
    gt: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: async () => ({
      data: session
        ? {
            id: "s1",
            access: session.access,
            ends_at: "2099-01-01T00:00:00Z",
            company: { id: SUPPORT_SHOP, name: "Shop X", timezone: "America/Phoenix" },
          }
        : null,
    }),
    then: (done: (r: { count: number }) => unknown) =>
      done({
        count: table === "membership" && memberships.includes(String(filters.company_id)) ? 1 : 0,
      }),
  };
  return q;
}
vi.mock("@/server/admin", () => ({ adminClient: () => ({ from: query }) }));
vi.stubEnv("SUNDECK_STAFF_EMAILS", "staff@sundeckpro.test");

const { viewOnlyIn } = await import("../src/server/support");
const staff = { id: "u1", email: "staff@sundeckpro.test", aal: "aal2" };

beforeEach(() => {
  session = { access: "view" };
  memberships = [];
});

describe("View Only support sessions", () => {
  it("refuse changes in the support shop", async () => {
    expect(await viewOnlyIn(staff, SUPPORT_SHOP)).toBe(true);
    expect(await viewOnlyIn(staff, undefined)).toBe(true);
  });

  it("refuse changes when the shop cookie names a shop the person isn't in", async () => {
    expect(await viewOnlyIn(staff, "made-up")).toBe(true);
    expect(await viewOnlyIn(staff, "shop-y")).toBe(true);
  });

  it("leave staff their own shop, and a shop they belong to", async () => {
    memberships = ["shop-y"];
    expect(await viewOnlyIn(staff, "shop-y")).toBe(false);
    expect(await viewOnlyIn(staff, SUPPORT_SHOP)).toBe(true);
    memberships = [SUPPORT_SHOP];
    expect(await viewOnlyIn(staff, SUPPORT_SHOP)).toBe(false);
  });

  it("don't apply to Can Make Changes sessions, other people, or no session", async () => {
    session = { access: "edit" };
    expect(await viewOnlyIn(staff, SUPPORT_SHOP)).toBe(false);
    session = { access: "view" };
    expect(await viewOnlyIn({ ...staff, email: "owner@shop.test" }, SUPPORT_SHOP)).toBe(false);
    session = null;
    expect(await viewOnlyIn(staff, SUPPORT_SHOP)).toBe(false);
  });
});
