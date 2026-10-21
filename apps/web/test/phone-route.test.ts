import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.fn();
const line = {
  findLineNumbers: vi.fn(),
  takeLineNumber: vi.fn(),
  keepLineNumber: vi.fn(),
  cancelLineNumber: vi.fn(),
  saveLineSettings: vi.fn(),
  saveOwnPhone: vi.fn(),
  phoneSettings: vi.fn(),
};
const locate = { locatePropertyWith: vi.fn(), locateCompanyWith: vi.fn() };
const home = { locateHomeWith: vi.fn(), memberStartOf: vi.fn() };
vi.mock("@/server/bearer", () => ({
  bearerSession: (r: Request) => session(r),
  jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
}));
vi.mock("@/server/phone-line", () => line);
vi.mock("@/server/route-days", () => locate);
vi.mock("@/server/member-start", () => home);
vi.mock("@/server/routing", () => ({ routingConfigured: () => true }));
vi.mock("@/lib/origin", () => ({ siteOrigin: async () => "https://sundeckpro.test" }));
vi.mock("server-only", () => ({}));

/** A client whose membership read gives this role, and whose row reads give `row`. */
function db(role: string | null, row: unknown = null) {
  const chain = (data: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is"]) q[m] = () => q;
    q.maybeSingle = () => Promise.resolve({ data });
    return q;
  };
  return { from: (t: string) => chain(t === "membership" ? (role ? { role } : null) : row) };
}

const phone = await import("../src/app/api/phone/route");
const located = await import("../src/app/api/locate/route");
const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
  handler(
    new Request("https://sundeckpro.test/api", { method: "POST", body: JSON.stringify(body) }),
  );

describe("/api/phone (the apps' Phone and Texting)", () => {
  beforeEach(() => {
    session.mockReset().mockResolvedValue({ db: db("owner"), userId: "u1", email: "d@x.test" });
    for (const f of Object.values(line)) f.mockReset().mockResolvedValue({ message: "Saved." });
  });

  it("needs a signed-in member of the shop", async () => {
    session.mockResolvedValueOnce(null);
    expect((await post(phone.POST, { company_id: "c1", action: "cancel" })).status).toBe(401);
    session.mockResolvedValueOnce({ db: db(null), userId: "u1", email: "" });
    expect((await post(phone.POST, { company_id: "c1", action: "cancel" })).status).toBe(403);
    expect(line.cancelLineNumber).not.toHaveBeenCalled();
  });

  it("lets techs set their own mobile number, and only managers the company number", async () => {
    session.mockResolvedValue({ db: db("tech"), userId: "u2", email: "" });
    expect(
      (await post(phone.POST, { company_id: "c1", action: "my_phone", phone: "6025550100" }))
        .status,
    ).toBe(200);
    expect(line.saveOwnPhone).toHaveBeenCalledWith(expect.anything(), "u2", "6025550100");
    expect(
      (await post(phone.POST, { company_id: "c1", action: "take", number: "+16025550100" })).status,
    ).toBe(403);
    expect(line.takeLineNumber).not.toHaveBeenCalled();
  });

  it("buys a number for an owner, and passes form errors back", async () => {
    expect(
      await (
        await post(phone.POST, { company_id: "c1", action: "take", number: "+16025550100" })
      ).json(),
    ).toEqual({
      message: "Saved.",
    });
    expect(line.takeLineNumber).toHaveBeenCalledWith(
      expect.anything(),
      "c1",
      "+16025550100",
      "https://sundeckpro.test",
    );
    line.keepLineNumber.mockResolvedValue({
      error: "Enter a US phone number.",
      fields: { number: "Enter a US phone number." },
    });
    const res = await post(phone.POST, { company_id: "c1", action: "keep", number: "12" });
    expect(res.status).toBe(400);
    expect((await res.json()).fields).toEqual({ number: "Enter a US phone number." });
  });

  it("saves the line's settings with only the ids it was sent", async () => {
    await post(phone.POST, {
      company_id: "c1",
      action: "save",
      pictures: true,
      ring_user_ids: ["u1", 4, "u3"],
      voicemail_greeting: "Hi",
    });
    expect(line.saveLineSettings).toHaveBeenCalledWith(expect.anything(), "c1", {
      pictures: true,
      ringUserIds: ["u1", "u3"],
      greeting: "Hi",
    });
  });
});

describe("/api/locate (an address changed in the app)", () => {
  beforeEach(() => {
    locate.locatePropertyWith.mockReset();
    locate.locateCompanyWith.mockReset();
  });

  it("looks up the pool's new address", async () => {
    session.mockResolvedValue({ db: db("tech"), userId: "u2", email: "" });
    locate.locatePropertyWith.mockResolvedValue({ lat: 36.15, lng: -115.27 });
    const res = await post(located.POST, { company_id: "c1", property_id: "p1" });
    expect(await res.json()).toEqual({ latitude: 36.15, longitude: -115.27 });
    expect(locate.locatePropertyWith).toHaveBeenCalledWith(expect.anything(), "c1", "p1");
  });

  it("gives the pin it has when the address hasn't changed, and 404 when none is found", async () => {
    session.mockResolvedValue({
      db: db("tech", { latitude: 1, longitude: 2 }),
      userId: "u2",
      email: "",
    });
    locate.locatePropertyWith.mockResolvedValue(null);
    expect(
      await (await post(located.POST, { company_id: "c1", property_id: "p1" })).json(),
    ).toEqual({
      latitude: 1,
      longitude: 2,
    });
    session.mockResolvedValue({ db: db("tech", null), userId: "u2", email: "" });
    expect((await post(located.POST, { company_id: "c1", property_id: "p1" })).status).toBe(404);
  });

  it("looks up your own home address, or anyone's for owners and admins", async () => {
    home.locateHomeWith.mockReset().mockResolvedValue({ lat: 33.4, lng: -111.8 });
    session.mockResolvedValue({ db: db("tech"), userId: "u2", email: "" });
    const res = await post(located.POST, { company_id: "c1", home_user_id: "u2" });
    expect(await res.json()).toEqual({ latitude: 33.4, longitude: -111.8 });
    expect(home.locateHomeWith).toHaveBeenCalledWith(expect.anything(), "c1", "u2");
    // A tech can't look up a teammate's home.
    home.locateHomeWith.mockClear();
    expect((await post(located.POST, { company_id: "c1", home_user_id: "u3" })).status).toBe(403);
    expect(home.locateHomeWith).not.toHaveBeenCalled();
    session.mockResolvedValue({ db: db("admin"), userId: "u1", email: "" });
    expect((await post(located.POST, { company_id: "c1", home_user_id: "u3" })).status).toBe(200);
  });

  it("gives the home pin it has when nothing changed, and 404 when none is found", async () => {
    session.mockResolvedValue({ db: db("tech"), userId: "u2", email: "" });
    home.locateHomeWith.mockReset().mockResolvedValue(null);
    home.memberStartOf.mockReset().mockResolvedValue({ home_latitude: 1, home_longitude: 2 });
    expect(
      await (await post(located.POST, { company_id: "c1", home_user_id: "u2" })).json(),
    ).toEqual({ latitude: 1, longitude: 2 });
    home.memberStartOf.mockResolvedValue({ home_latitude: null, home_longitude: null });
    expect((await post(located.POST, { company_id: "c1", home_user_id: "u2" })).status).toBe(404);
    expect((await post(located.POST, { company_id: "c1", home_user_id: 5 })).status).toBe(400);
  });

  it("moves the shop only for owners and admins", async () => {
    session.mockResolvedValue({ db: db("tech"), userId: "u2", email: "" });
    expect((await post(located.POST, { company_id: "c1", shop: true })).status).toBe(403);
    expect(locate.locateCompanyWith).not.toHaveBeenCalled();
  });
});
