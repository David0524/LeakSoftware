import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "sundeckpro.test" }) }));

// Invites email the link (owner, 2026-11-24).
const sent: { to: string; from: string; replyTo: string | null; subject: string; text: string }[] =
  [];
let configured = true;
let refusal: string | null = null;
vi.mock("@/server/email", () => ({
  emailConfigured: () => configured,
  fromAddress: (shop: string) => `"${shop} via Sundeck Pro" <reports@send.test>`,
  sendEmail: async (e: (typeof sent)[number]) => {
    sent.push(e);
    return { id: "e1" };
  },
}));
vi.mock("@/server/usage", () => ({ emailRefusal: async () => refusal }));

const { createAndSendInvite } = await import("../src/server/invites");
const { inviteEmail } = await import("../src/lib/invite-email");

const rows: Record<string, unknown> = {
  company: { name: "Blue Wave Pools" },
  profile: { full_name: "Dana Ruiz", email: "dana@bluewave.test" },
};
const rpc = vi.fn();
const db = {
  rpc,
  from: (table: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: rows[table] ?? null }),
    };
    return q;
  },
} as never;
const input = { companyId: "c1", userId: "u1", email: " Luis@Example.test ", role: "tech" };

beforeEach(() => {
  sent.length = 0;
  configured = true;
  refusal = null;
  rpc.mockReset();
  rpc.mockResolvedValue({ data: "tok123", error: null });
});

describe("createAndSendInvite", () => {
  it("makes the invite and emails its link, replies going to the inviter", async () => {
    const r = await createAndSendInvite(db, input);
    expect(rpc).toHaveBeenCalledWith("create_invite", {
      target_company: "c1",
      invite_email: "luis@example.test",
      invite_role: "tech",
    });
    expect(r).toEqual({
      ok: true,
      emailed: true,
      message: "Invite emailed to luis@example.test. The link is also under Open invites.",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("luis@example.test");
    expect(sent[0]!.replyTo).toBe("dana@bluewave.test");
    expect(sent[0]!.from).toContain("Blue Wave Pools via Sundeck Pro");
    expect(sent[0]!.subject).toBe("Join Blue Wave Pools on Sundeck Pro");
    expect(sent[0]!.text).toContain("://sundeckpro.test/invite/tok123");
  });

  it("keeps the invite when email isn't set up, and says to send the link", async () => {
    configured = false;
    const r = await createAndSendInvite(db, input);
    expect(r).toMatchObject({ ok: true, emailed: false });
    expect(r.ok && r.message).toBe(
      "Invite created for luis@example.test, but the email didn’t go. Email isn’t set up yet. Send the link from Open invites yourself.",
    );
    expect(sent).toHaveLength(0);
  });

  it("doesn't email past the shop's daily limit", async () => {
    refusal = "Your shop has reached today’s limit for this. It resets tomorrow.";
    const r = await createAndSendInvite(db, input);
    expect(r).toMatchObject({ ok: true, emailed: false });
    expect(sent).toHaveLength(0);
  });

  it("sends nothing when the invite can't be made", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Only owners and admins can invite" } });
    const r = await createAndSendInvite(db, input);
    expect(r).toEqual({ ok: false, error: "Only owners and admins can invite" });
    expect(sent).toHaveLength(0);
  });
});

describe("inviteEmail", () => {
  it("names who invited them, the shop, and the role", () => {
    const m = inviteEmail({
      shopName: "Blue Wave Pools",
      inviterName: "Dana Ruiz",
      role: "admin",
      link: "https://x.test/invite/t",
    });
    expect(m.text).toContain(
      "Dana Ruiz invited you to join Blue Wave Pools on Sundeck Pro as an admin.",
    );
    expect(m.html).toContain('href="https://x.test/invite/t"');
    expect(m.html).toContain("Accept Invite");
  });

  it("escapes the shop name in the html", () => {
    const m = inviteEmail({ shopName: "<b>Pools</b>", inviterName: null, role: "tech", link: "l" });
    expect(m.html).not.toContain("<b>Pools</b>");
    expect(m.text).toContain(
      "<b>Pools</b> invited you to join <b>Pools</b> on Sundeck Pro as a tech.",
    );
  });
});
