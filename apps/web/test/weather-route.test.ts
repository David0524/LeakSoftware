import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.fn();
const weather = vi.fn();
vi.mock("@/server/bearer", () => ({
  bearerSession: (r: Request) => session(r),
  jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
}));
vi.mock("@/server/weather", () => ({ weatherForZip: (zip: string) => weather(zip) }));

const { GET } = await import("../src/app/api/weather/route");
const get = (query: string) => GET(new Request(`https://sundeckpro.test/api/weather${query}`));

describe("GET /api/weather (the apps' Today)", () => {
  beforeEach(() => {
    session.mockReset().mockResolvedValue({ db: {}, userId: "u1" });
    weather.mockReset();
  });

  it("needs a signed-in user", async () => {
    session.mockResolvedValue(null);
    const res = await get("?zip=85201");
    expect(res.status).toBe(401);
    expect(weather).not.toHaveBeenCalled();
  });

  it("needs a 5-digit zip code", async () => {
    for (const q of ["", "?zip=852", "?zip=abcde", "?zip=85201-1234"]) {
      expect((await get(q)).status, q).toBe(400);
    }
    expect(weather).not.toHaveBeenCalled();
  });

  it("returns the shop's weather, or null when the service doesn't answer", async () => {
    const w = { tempF: 76, conditions: "Mostly Clear", kind: "clear", isDaytime: true, highF: 81 };
    weather.mockResolvedValueOnce(w).mockResolvedValueOnce(null);
    expect(await (await get("?zip=85201")).json()).toEqual({ weather: w });
    expect(weather).toHaveBeenCalledWith("85201");
    expect(await (await get("?zip=85201")).json()).toEqual({ weather: null });
  });
});
