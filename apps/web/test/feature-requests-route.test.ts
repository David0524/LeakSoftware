import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.fn();
const record = vi.fn();
vi.mock("@/server/bearer", () => ({
  bearerSession: (r: Request) => session(r),
  jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
}));
vi.mock("@/server/feature-requests", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../src/server/feature-requests");
  return { ...actual, recordFeatureRequest: (input: unknown) => record(input) };
});
vi.mock("server-only", () => ({}));

/** A client whose membership and profile reads answer with these rows. */
function db(companies: { id: string; name: string }[], name: string | null = "Dana Tech") {
  const chain = (data: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is"]) q[m] = () => q;
    q.maybeSingle = () => Promise.resolve({ data });
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data }).then(ok);
    return q;
  };
  return {
    from: (table: string) =>
      table === "membership"
        ? chain(companies.map((company) => ({ company })))
        : chain({ full_name: name }),
  };
}

const { POST } = await import("../src/app/api/feature-requests/route");
const post = (body: unknown) =>
  POST(
    new Request("https://sundeckpro.test/api/feature-requests", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/feature-requests (the apps' Request a Feature)", () => {
  const shop = { id: "c1", name: "Blue Pools" };
  beforeEach(() => {
    session.mockReset().mockResolvedValue({ db: db([shop]), userId: "u1", email: "dana@x.test" });
    record.mockReset().mockResolvedValue({ ok: true });
  });

  it("needs a signed-in user", async () => {
    session.mockResolvedValue(null);
    expect((await post({ request: "Dark mode" })).status).toBe(401);
    expect(record).not.toHaveBeenCalled();
  });

  it("needs something typed", async () => {
    const res = await post({ request: "   ", company_id: "c1" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Tell us what you’d like Sundeck Pro to do." });
  });

  it("only for a shop the person is on", async () => {
    expect((await post({ request: "Dark mode", company_id: "other" })).status).toBe(403);
    expect(record).not.toHaveBeenCalled();
  });

  it("saves it with the person and shop", async () => {
    const res = await post({ request: " Dark mode ", company_id: "c1", page: "iPhone app" });
    expect(await res.json()).toEqual({ message: "Thanks! We read every request." });
    expect(record).toHaveBeenCalledWith({
      user: { id: "u1", name: "Dana Tech", email: "dana@x.test" },
      company: shop,
      request: "Dark mode",
      page: "iPhone app",
    });
  });

  it("says so when it couldn't be saved", async () => {
    record.mockResolvedValue({ ok: false, error: "That didn’t go through." });
    const res = await post({ request: "Dark mode", company_id: "c1" });
    expect(res.status).toBe(503);
  });
});
