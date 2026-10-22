import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getUser: () => getUser() }));
const getClaims = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getClaims: (t: string) => getClaims(t) } }),
}));
const rpc = vi.fn();
let shops: string[] = [];
vi.mock("@/server/admin", () => ({
  adminClient: () => ({
    rpc,
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is"]) q[m] = () => q;
      q.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: shops.map((company_id) => ({ company_id })) }).then(ok);
      return q;
    },
  }),
}));

const { POST } = await import("../src/app/api/usage/route");
const session = "0192f0a0-0000-7000-8000-000000000001";
const event = {
  kind: "screen",
  screen: "/jobs/42",
  ms: 60_000,
  at: new Date().toISOString(),
  session,
};
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("https://sundeckpro.test/api/usage", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: 1 });
  getUser.mockReset().mockResolvedValue({ id: "web-user" });
  getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: "phone-user" } }, error: null });
  shops = ["c1", "c2"];
});

// Usage (owner, 2026-10-22): the website and the apps send screen time and errors here.
describe("POST /api/usage", () => {
  it("records the website's events for the person's shop, ids taken out", async () => {
    const res = await post({ platform: "web", company_id: "c2", events: [event] });
    expect(res.status).toBe(204);
    expect(rpc).toHaveBeenCalledWith("record_usage", {
      target_user: "web-user",
      target_company: "c2",
      from_platform: "web",
      version: null,
      events: [expect.objectContaining({ screen: "/jobs/:id", ms: 60_000 })],
    });
  });

  it("takes the apps' token and version", async () => {
    await post(
      { platform: "ios", version: "1.4.0 (52)", events: [event] },
      { authorization: "Bearer abc" },
    );
    expect(getClaims).toHaveBeenCalledWith("abc");
    expect(rpc.mock.calls[0]![1]).toMatchObject({
      target_user: "phone-user",
      target_company: "c1",
      from_platform: "ios",
      version: "1.4.0 (52)",
    });
  });

  it("doesn't count anyone in a shop they don't belong to (staff helping a shop)", async () => {
    await post({ platform: "web", company_id: "someone-elses", events: [event] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("asks for a sign-in, and ignores what isn't usage", async () => {
    getUser.mockResolvedValue(null);
    expect((await post({ platform: "web", events: [event] })).status).toBe(401);
    expect((await post({ platform: "tv", events: [event] })).status).toBe(204);
    expect((await post({ platform: "web", events: [{ kind: "click" }] })).status).toBe(204);
    expect(rpc).not.toHaveBeenCalled();
  });
});
