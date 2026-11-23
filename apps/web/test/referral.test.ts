import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/origin", () => ({ siteOrigin: async () => "https://sundeckpro.com" }));

const { referralFromSummary, referralOfferFor } = await import("../src/server/referral");

const owner = { isOwner: true, company: { id: "c1" } };

function db(result: { data?: unknown; error?: unknown } | Error) {
  const rpc = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return { data: result.data ?? null, error: result.error ?? null };
  });
  return { rpc } as unknown as Parameters<typeof referralOfferFor>[1] & { rpc: typeof rpc };
}

describe("referralFromSummary", () => {
  it("reads the code and counts", () => {
    expect(referralFromSummary({ code: "BLUEWAVEPOOLS", used: 3, earned: "2" })).toEqual({
      code: "BLUEWAVEPOOLS",
      used: 3,
      earned: 2,
    });
  });

  it("gives null without a code", () => {
    expect(referralFromSummary(null)).toBeNull();
    expect(referralFromSummary({ code: null, used: 0, earned: 0 })).toBeNull();
    expect(referralFromSummary({ code: "  " })).toBeNull();
    expect(referralFromSummary("BLUEWAVEPOOLS")).toBeNull();
  });

  it("counts nothing for missing or odd numbers", () => {
    expect(referralFromSummary({ code: "X1Y", used: null, earned: -1 })).toEqual({
      code: "X1Y",
      used: 0,
      earned: 0,
    });
  });
});

describe("referralOfferFor", () => {
  it("gives the owner the code with the sign-up link", async () => {
    const client = db({ data: { code: "BLUEWAVEPOOLS", used: 1, earned: 0 } });
    await expect(referralOfferFor(owner, client)).resolves.toEqual({
      code: "BLUEWAVEPOOLS",
      used: 1,
      earned: 0,
      signUpUrl: "https://sundeckpro.com/sign-up",
    });
    expect(client.rpc).toHaveBeenCalledWith("referral_summary", { target_company: "c1" });
  });

  it("asks nothing for admins and techs", async () => {
    const client = db({ data: { code: "BLUEWAVEPOOLS", used: 0, earned: 0 } });
    await expect(referralOfferFor({ ...owner, isOwner: false }, client)).resolves.toBeNull();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("shows nothing when there's no code or the call fails", async () => {
    await expect(referralOfferFor(owner, db({ data: null }))).resolves.toBeNull();
    await expect(
      referralOfferFor(owner, db({ error: { message: "Only the shop's owner can see this" } })),
    ).resolves.toBeNull();
    await expect(referralOfferFor(owner, db(new Error("offline")))).resolves.toBeNull();
  });
});
