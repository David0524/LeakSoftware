import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/mapkit-token (docs/plans/apple-maps.md): signed in only, never cached, counted.

const session = vi.fn();
const cookieUser = vi.fn();
const member = vi.fn();
const budget = vi.fn();
vi.mock("@/server/bearer", () => ({
  bearerSession: (r: Request) => session(r),
  jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: cookieUser() } }) } }),
}));
vi.mock("@/server/bearer-member", () => ({
  memberRole: (_s: unknown, company: unknown) => member(company),
}));
vi.mock("@/server/routing", () => ({
  mapboxBudget: (_db: unknown, company: string, kind: string, n: number) =>
    budget(company, kind, n),
}));
vi.mock("@/lib/origin", () => ({ siteOrigin: async () => "https://sundeckpro.test" }));

const { GET } = await import("../src/app/api/mapkit-token/route");
const get = () => GET(new Request("https://sundeckpro.test/api/mapkit-token?company=c1"));

// A throwaway P-256 key made for this test; never a real Apple key.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const KEYS = {
  APPLE_MAPS_TEAM_ID: "TEAM123456",
  APPLE_MAPS_KEY_ID: "KEY7654321",
  APPLE_MAPS_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

describe("GET /api/mapkit-token", () => {
  beforeEach(() => {
    session.mockReset().mockResolvedValue(null);
    cookieUser.mockReset().mockReturnValue({ id: "u1" });
    member.mockReset().mockResolvedValue("owner");
    budget.mockReset().mockResolvedValue(true);
    for (const [k, v] of Object.entries(KEYS)) vi.stubEnv(k, v);
    vi.stubEnv("MAP_PROVIDER", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("refuses signed-out visitors, and never lets the refusal be cached", async () => {
    cookieUser.mockReturnValue(null);
    const res = await get();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(budget).not.toHaveBeenCalled();
  });

  it("refuses people who aren't on the shop's team", async () => {
    member.mockResolvedValue(null);
    expect((await get()).status).toBe(403);
    expect(budget).not.toHaveBeenCalled();
  });

  it("is 404 without the Apple keys, or with MAP_PROVIDER=mapbox", async () => {
    vi.stubEnv("APPLE_MAPS_PRIVATE_KEY", "");
    expect((await get()).status).toBe(404);
    vi.stubEnv("APPLE_MAPS_PRIVATE_KEY", KEYS.APPLE_MAPS_PRIVATE_KEY);
    vi.stubEnv("MAP_PROVIDER", "mapbox");
    expect((await get()).status).toBe(404);
    expect(budget).not.toHaveBeenCalled();
  });

  it("is 429 past Apple's free map views", async () => {
    budget.mockResolvedValue(false);
    expect((await get()).status).toBe(429);
    expect(budget).toHaveBeenCalledWith("c1", "apple_map_view", 1);
  });

  it("signs a 30-minute token for this site, counted as one map view", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const jwt = await res.text();
    const [head, body, sig] = jwt.split(".");
    expect(
      verify(
        "sha256",
        Buffer.from(`${head}.${body}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(sig!, "base64url"),
      ),
    ).toBe(true);
    const claims = JSON.parse(Buffer.from(body!, "base64url").toString());
    expect(claims.iss).toBe("TEAM123456");
    expect(claims.origin).toBe("https://sundeckpro.test");
    expect(claims.exp - claims.iat).toBe(1800);
    expect(JSON.parse(Buffer.from(head!, "base64url").toString()).kid).toBe("KEY7654321");
    expect(jwt).not.toContain("PRIVATE");
    expect(budget).toHaveBeenCalledWith("c1", "apple_map_view", 1);
  });

  it("takes the phone apps' bearer sessions too", async () => {
    session.mockResolvedValue({ db: {}, userId: "u2", email: "" });
    cookieUser.mockReturnValue(null);
    expect((await get()).status).toBe(200);
  });
});
