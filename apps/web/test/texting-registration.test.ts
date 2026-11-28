import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The texting registration steps (docs/plans/texting-registration.md) against a pretend
// Twilio: each review approved, one sent back, an error retried later, nothing bought twice.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

/** Just enough of supabase-js for the server code: filters, insert, update, reads. */
function table(name: string) {
  const rows = (tables[name] ??= []);
  const filters: ((r: Row) => boolean)[] = [];
  let patch: Row | null = null;
  let inserted: Row | null = null;
  const matching = () => rows.filter((r) => filters.every((f) => f(r)));
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
    neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), q),
    is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), q),
    in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), q),
    lte: (k: string, v: string) => (filters.push((r) => String(r[k]) <= v), q),
    order: () => q,
    limit: () => q,
    insert: (row: Row) => {
      // The columns' defaults, as the migration sets them.
      const defaults: Row =
        name === "texting_registration"
          ? { stage: "registering", step: "start", attempts: 0, problem: null, last_error: null }
          : {};
      inserted = { deleted_at: null, ...defaults, ...row };
      rows.push(inserted);
      return q;
    },
    update: (p: Row) => ((patch = p), q),
    maybeSingle: () => Promise.resolve({ data: matching()[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: matching()[0] ?? null, error: null }),
    then: (done: (r: unknown) => unknown) => {
      if (patch) for (const r of matching()) Object.assign(r, structuredClone(patch));
      return done({ data: inserted ? [inserted] : matching(), error: null });
    },
  };
  return q;
}
const db = { from: table, rpc: async () => ({ data: { locked: false }, error: null }) };
vi.mock("@/server/admin", () => ({ adminClient: () => db }));
vi.mock("@/server/review-shop", () => ({
  isReviewShop: async () => false,
  REVIEW_NUMBERS_MESSAGE: "No.",
}));

/** Pretend Twilio: answers by URL; `status` sets what each review says. */
const status: Record<string, string> = {};
const calls: string[] = [];
let failNext: string | null = null;
function twilio(url: string, init?: RequestInit) {
  const method = init?.method ?? "GET";
  const path = url.replace(/^https:\/\/[a-z.]+\.com/, "");
  calls.push(`${method} ${path}`);
  const json = (body: unknown, code = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status: code }));
  if (failNext && path.includes(failNext)) {
    failNext = null;
    return json({ message: "Service unavailable", code: 20500 }, 503);
  }
  if (path.includes("/v2/PhoneNumbers/"))
    return json({ line_type_intelligence: { type: status.line ?? "mobile" } });
  if (path.endsWith("/Accounts.json")) return json({ sid: "AC_shop", auth_token: "tok" });
  if (path.includes("/AvailablePhoneNumbers/US/TollFree"))
    return json({ available_phone_numbers: [{ phone_number: "+18885550100" }] });
  if (path.includes("/IncomingPhoneNumbers.json") && method === "POST")
    return json({ sid: "PN_bought" });
  if (path.includes("/IncomingPhoneNumbers.json?"))
    return json({ incoming_phone_numbers: status.hosted ? [{ sid: "PN_hosted" }] : [] });
  if (path.includes("/IncomingPhoneNumbers/PN_hosted.json")) return json({ sid: "PN_hosted" });
  if (path.endsWith("/Tollfree/Verifications")) return json({ sid: "HH1" });
  if (path.includes("/Tollfree/Verifications/HH1"))
    return json({ status: status.tf ?? "IN_REVIEW", rejection_reason: status.tfWhy ?? null });
  if (path.includes("/Addresses.json")) return json({ sid: "AD1" });
  if (path.endsWith("/v1/CustomerProfiles")) return json({ sid: "BU_profile" });
  if (path.endsWith("/v1/TrustProducts")) return json({ sid: "BU_trust" });
  if (path.endsWith("/EndUsers")) return json({ sid: `IT${calls.length}` });
  if (path.endsWith("/SupportingDocuments")) return json({ sid: "RD1" });
  if (path.endsWith("/EntityAssignments")) return json({ sid: "BV1" });
  if (path.endsWith("/Evaluations")) return json({ status: "compliant", results: [] });
  if (/\/(CustomerProfiles|TrustProducts)\/BU_\w+$/.test(path))
    return json({ status: method === "POST" ? "pending-review" : (status.bundle ?? "in-review") });
  if (path.endsWith("/a2p/BrandRegistrations")) return json({ sid: "BN1" });
  if (path.endsWith("/a2p/BrandRegistrations/BN1"))
    return json({ status: status.brand ?? "PENDING" });
  if (path.endsWith("/v1/Services")) return json({ sid: "MG1" });
  if (path.endsWith("/Compliance/Usa2p")) return json({ sid: "QE1" });
  if (path.endsWith("/Compliance/Usa2p/QE1"))
    return json({ campaign_status: status.campaign ?? "IN_PROGRESS" });
  if (path.endsWith("/Services/MG1/PhoneNumbers")) return json({ sid: "PN" });
  if (path.includes("/Accounts/AC_shop.json")) return json({ auth_token: "tok" });
  return json({ message: `Unexpected ${method} ${path}` }, 404);
}

const reg = await import("../src/server/texting-registration");
const ORIGIN = "https://sundeckpro.test";
const business = {
  legal_name: "Blue Wave Pools LLC",
  business_type: "llc",
  ein: "12-3456789",
  street: "123 Main St",
  city: "Las Vegas",
  state: "NV",
  postal_code: "89101",
  website: "bluewavepools.com",
  first_name: "Alex",
  last_name: "Rivera",
  title: "Owner",
  email: "alex@bluewavepools.com",
  phone: "(702) 555-0100",
};
const owner = db as unknown as Parameters<typeof reg.startRegistration>[0];
const one = (name: string) => tables[name][0];
/** Run the cron as if its time had come. */
async function cron() {
  for (const r of tables.texting_registration) r.next_check_at = "2000-01-01T00:00:00Z";
  await reg.advanceDueRegistrations(db as never, ORIGIN);
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  for (const k of Object.keys(status)) delete status[k];
  calls.length = 0;
  failNext = null;
  tables.company = [{ id: "c1", name: "Blue Wave Pools", review_shop: false }];
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_main");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "main");
  vi.stubEnv("TWILIO_PRIMARY_PROFILE_SID", "BU_primary");
  vi.stubGlobal("fetch", vi.fn(twilio));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("a toll-free number", () => {
  it("is bought at once, verified, and ready when approved", async () => {
    const r = await reg.startRegistration(
      owner,
      "c1",
      "u1",
      { kind: "toll_free", business },
      ORIGIN,
    );
    expect(r).toEqual({ message: expect.stringContaining("registering") });
    expect(one("phone_line")).toMatchObject({ number: "+18885550100", status: "pending" });
    expect(one("texting_registration")).toMatchObject({ stage: "registering", step: "tf_wait" });
    expect(calls.filter((c) => c.includes("IncomingPhoneNumbers"))).toEqual([
      "POST /2010-04-01/Accounts/AC_shop/IncomingPhoneNumbers.json",
    ]);

    await cron(); // still in review
    expect(one("texting_registration").stage).toBe("registering");
    status.tf = "TWILIO_APPROVED";
    await cron();
    expect(one("texting_registration")).toMatchObject({ stage: "ready" });
    expect(one("phone_line").status).toBe("active");
    // Approved: only the EIN's last 4 are kept.
    expect((one("texting_registration").business as { ein: string }).ein).toBe("*****6789");
    // Bought once, however often it was checked.
    expect(
      calls.filter((c) => c.startsWith("POST") && c.includes("IncomingPhoneNumbers")),
    ).toHaveLength(1);
  });

  it("goes to Needs Changes when rejected, and starts again with new details", async () => {
    await reg.startRegistration(owner, "c1", "u1", { kind: "toll_free", business }, ORIGIN);
    status.tf = "TWILIO_REJECTED";
    status.tfWhy = "Website doesn't match the business";
    await cron();
    const row = one("texting_registration");
    expect(row.stage).toBe("needs_changes");
    expect(row.problem).toContain("Website doesn't match the business");
    const view = reg.registrationView(row as never, "+18885550100");
    expect(view).toMatchObject({ title: "Needs Changes", ein_last4: "6789" });
    expect(view?.business.ein).toBe("");

    status.tf = "IN_REVIEW";
    // The EIN left empty keeps the saved one.
    const r = await reg.updateRegistration(
      owner,
      "c1",
      { ...business, ein: "", website: "bluewave.example.com" },
      ORIGIN,
    );
    expect(r).toEqual({ message: expect.any(String) });
    expect(one("texting_registration")).toMatchObject({ stage: "registering", step: "tf_wait" });
    expect((one("texting_registration").business as { ein: string }).ein).toBe("12-3456789");
    // The old verification was removed before the new one; the number wasn't bought again.
    expect(calls).toContain("DELETE /v1/Tollfree/Verifications/HH1");
    expect(
      calls.filter((c) => c.startsWith("POST") && c.includes("IncomingPhoneNumbers")),
    ).toHaveLength(1);
  });
});

describe("the contact person's mobile", () => {
  it("must get texts: a landline is refused before anything is bought", async () => {
    status.line = "landline";
    const r = await reg.startRegistration(
      owner,
      "c1",
      "u1",
      { kind: "toll_free", business },
      ORIGIN,
    );
    expect(r).toMatchObject({ fields: { phone: reg.NOT_A_CELL } });
    expect(tables.texting_registration ?? []).toHaveLength(0);
    expect(calls.some((c) => c.includes("Accounts.json"))).toBe(false);
    status.line = "mobile";
    expect(
      await reg.startRegistration(owner, "c1", "u1", { kind: "toll_free", business }, ORIGIN),
    ).toEqual({ message: expect.any(String) });
  });
});

describe("a local number", () => {
  it("is registered with the phone companies and joins its campaign", async () => {
    await reg.startRegistration(
      owner,
      "c1",
      "u1",
      { kind: "local", number: "+17025550147", business },
      ORIGIN,
    );
    expect(one("phone_line")).toMatchObject({
      number: "+17025550147",
      status: "pending",
      provider_sid: "PN_bought",
    });
    expect(one("texting_registration").step).toBe("profile_wait");
    status.bundle = "twilio-approved";
    await cron();
    expect(one("texting_registration").step).toBe("brand_wait");
    status.brand = "APPROVED";
    await cron();
    expect(one("texting_registration").step).toBe("campaign_wait");
    status.campaign = "VERIFIED";
    await cron();
    expect(one("texting_registration")).toMatchObject({ stage: "ready" });
    expect(one("texting_registration").twilio).toMatchObject({
      account_sid: "AC_shop",
      messaging_service_sid: "MG1",
      attached: "true",
    });
    expect(one("phone_line").status).toBe("active");
    expect(await reg.lineRoute(db as never, "c1")).toEqual({
      account: "AC_shop",
      messagingService: "MG1",
    });
  });

  it("tries again later after an error, without repeating what worked", async () => {
    failNext = "/a2p/BrandRegistrations";
    await reg.startRegistration(
      owner,
      "c1",
      "u1",
      { kind: "local", number: "+17025550147", business },
      ORIGIN,
    );
    status.bundle = "twilio-approved";
    await cron();
    const row = one("texting_registration");
    expect(row).toMatchObject({ step: "brand", stage: "registering", attempts: 1 });
    expect(row.last_error).toContain("Service unavailable");
    await cron();
    expect(one("texting_registration")).toMatchObject({ step: "brand_wait", attempts: 0 });
    expect(calls.filter((c) => c === "POST /v1/CustomerProfiles")).toHaveLength(1);
  });
});

describe("the shop's own number", () => {
  it("waits for the number to be hosted, then points its texts here", async () => {
    await reg.startRegistration(
      owner,
      "c1",
      "u1",
      { kind: "own", number: "(702) 381-1966", business },
      ORIGIN,
    );
    expect(one("phone_line")).toMatchObject({ number: "+17023811966", source: "existing" });
    status.bundle = "twilio-approved";
    status.brand = "APPROVED";
    status.campaign = "VERIFIED";
    await cron();
    expect(one("texting_registration").step).toBe("hosted_wait");
    // Staff host it in the shop's subaccount; the next check finds it.
    status.hosted = "yes";
    await cron();
    expect(one("texting_registration").stage).toBe("ready");
    expect(one("phone_line")).toMatchObject({ status: "active", provider_sid: "PN_hosted" });
    expect(calls).toContain(
      "POST /2010-04-01/Accounts/AC_shop/IncomingPhoneNumbers/PN_hosted.json",
    );
    // Nothing was bought for it.
    expect(calls.some((c) => c.includes("AvailablePhoneNumbers"))).toBe(false);
  });
});

describe("without Twilio (demo)", () => {
  it("is ready at once", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    expect(
      await reg.startRegistration(owner, "c1", "u1", { kind: "toll_free", business }, ORIGIN),
    ).toEqual({ message: "Your number is ready." });
    expect(one("phone_line").status).toBe("active");
    expect(one("texting_registration").stage).toBe("ready");
  });

  it("waits on the live site until Twilio is connected", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(
      await reg.startRegistration(owner, "c1", "u1", { kind: "toll_free", business }, ORIGIN),
    ).toEqual({ message: expect.stringContaining("shortly") });
    expect(one("texting_registration")).toMatchObject({ stage: "registering", step: "start" });
    expect(tables.phone_line ?? []).toHaveLength(0);
    // Connected later: the next check starts the work.
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_main");
    await cron();
    expect(one("texting_registration").step).toBe("tf_wait");
  });

  it("checks the details first", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    const r = await reg.startRegistration(
      owner,
      "c1",
      "u1",
      { kind: "own", number: "", business: { ...business, ein: "1" } },
      ORIGIN,
    );
    expect(r).toMatchObject({ fields: { ein: expect.any(String), number: expect.any(String) } });
    expect(tables.texting_registration ?? []).toHaveLength(0);
  });
});
