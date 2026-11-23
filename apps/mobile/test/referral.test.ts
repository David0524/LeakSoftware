import { describe, expect, it, vi } from "vitest";
import { fetchReferShare } from "../src/lib/referral";

// More › Refer a Pool Company (owner, 2026-11-23): owners only, from referral_summary; nothing
// when there's no code or the server can't be reached.

const SITE = "https://sundeckpro.com";

function server(reply: { data?: unknown; error?: unknown } | Error) {
  return {
    rpc: vi.fn(async () => {
      if (reply instanceof Error) throw reply;
      return { data: reply.data ?? null, error: reply.error ?? null };
    }),
  };
}

describe("fetchReferShare", () => {
  it("gives an owner the shop's link and the share message", async () => {
    const supabase = server({ data: { code: "BLUEWAVEPOOLS", used: 2, earned: 1 } });
    await expect(fetchReferShare(supabase as never, "c1", "owner", SITE)).resolves.toEqual({
      link: "https://sundeckpro.com/sign-up?code=BLUEWAVEPOOLS",
      message:
        "Try Sundeck Pro for your pool business: https://sundeckpro.com/sign-up?code=BLUEWAVEPOOLS",
    });
    expect(supabase.rpc).toHaveBeenCalledWith("referral_summary", { target_company: "c1" });
  });

  it("doesn't ask the server for admins or techs", async () => {
    for (const role of ["admin", "tech", null]) {
      const supabase = server({ data: { code: "BLUEWAVEPOOLS" } });
      await expect(fetchReferShare(supabase as never, "c1", role, SITE)).resolves.toBeNull();
      expect(supabase.rpc).not.toHaveBeenCalled();
    }
  });

  it("shows nothing without a code, on an error, or offline", async () => {
    await expect(
      fetchReferShare(server({ data: { code: null } }) as never, "c1", "owner", SITE),
    ).resolves.toBeNull();
    await expect(
      fetchReferShare(server({ data: null }) as never, "c1", "owner", SITE),
    ).resolves.toBeNull();
    await expect(
      fetchReferShare(
        server({ error: { message: "Only the shop's owner can see this" } }) as never,
        "c1",
        "owner",
        SITE,
      ),
    ).resolves.toBeNull();
    await expect(
      fetchReferShare(
        server(new TypeError("Network request failed")) as never,
        "c1",
        "owner",
        SITE,
      ),
    ).resolves.toBeNull();
    await expect(
      fetchReferShare(server({ data: { code: "BLUEWAVEPOOLS" } }) as never, "c1", "owner", null),
    ).resolves.toBeNull();
  });
});
