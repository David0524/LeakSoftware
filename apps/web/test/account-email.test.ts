import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "sundeckpro.test" }) }));

// The server's own confirmation and sign-in emails (owner, 2026-10-24: "link expired").
const generateLink = vi.fn();
const updateUserById = vi.fn();
const rpc = vi.fn();
const db = { rpc, auth: { admin: { generateLink, updateUserById } } };
vi.mock("@/server/admin", () => ({ adminClient: () => db }));
const sent: { to: string; subject: string; text: string }[] = [];
vi.mock("@/server/email", () => ({
  emailConfigured: () => true,
  sendEmail: async (e: (typeof sent)[number]) => {
    sent.push(e);
    return { id: "e1" };
  },
}));

const { createAccount, signInLinkByEmail, confirmationRequired } =
  await import("../src/server/account-email");

const signUp = vi.fn();
const client = { auth: { signUp } } as never;
const input = { email: " Dana@BlueWave.test ", password: "Pool-Leak-42", data: {}, next: "/setup" };

beforeEach(() => {
  sent.length = 0;
  generateLink.mockReset();
  updateUserById.mockReset().mockResolvedValue({ error: null });
  rpc.mockReset();
  signUp.mockReset();
});

describe("confirmation emails", () => {
  it("makes the account and emails a link that works in any browser", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ mailer_autoconfirm: false })),
    );
    expect(await confirmationRequired()).toBe(true);
    generateLink.mockResolvedValue({
      data: {
        properties: { hashed_token: "pkce_abc" },
        user: { id: "u1", email_confirmed_at: null },
      },
      error: null,
    });
    expect(await createAccount(client, input)).toEqual({ kind: "confirm", userId: "u1" });
    expect(generateLink).toHaveBeenCalledWith({
      type: "signup",
      email: "dana@bluewave.test",
      password: "Pool-Leak-42",
      options: { data: {} },
    });
    expect(signUp).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("dana@bluewave.test");
    expect(sent[0]!.text).toContain(
      "https://sundeckpro.test/auth/confirm?token_hash=pkce_abc&type=signup&next=%2Fsetup",
    );
    // An earlier unconfirmed sign-up takes the password just chosen.
    expect(updateUserById).toHaveBeenCalledWith("u1", { password: "Pool-Leak-42" });
  });

  it("says when the email already has an account", async () => {
    generateLink.mockResolvedValue({ data: {}, error: { code: "email_exists", message: "x" } });
    expect(await createAccount(client, input)).toEqual({
      kind: "error",
      error: "An account with this email already exists. Sign in instead.",
    });
    expect(sent).toHaveLength(0);
  });
});

describe("sign-in links", () => {
  it("sends only to an existing account, and never makes one", async () => {
    rpc.mockResolvedValue({ data: "none" });
    expect(await signInLinkByEmail("nobody@bluewave.test", "/jobs")).toBe("no_account");
    expect(generateLink).not.toHaveBeenCalled();

    rpc.mockResolvedValue({ data: "confirmed" });
    generateLink.mockResolvedValue({ data: { properties: { hashed_token: "h2" } }, error: null });
    expect(await signInLinkByEmail("Dana@bluewave.test", "/jobs/1")).toBe("sent");
    expect(sent[0]!.subject).toBe("Your Sundeck Pro sign-in link");
    expect(sent[0]!.text).toContain("token_hash=h2&type=magiclink&next=%2Fjobs%2F1");
  });

  it("doubles as a new confirmation link", async () => {
    rpc.mockResolvedValue({ data: "unconfirmed" });
    generateLink.mockResolvedValue({ data: { properties: { hashed_token: "h3" } }, error: null });
    expect(await signInLinkByEmail("dana@bluewave.test", "/setup", "confirm")).toBe("sent");
    expect(sent[0]!.subject).toBe("Confirm your email for Sundeck Pro");
  });
});
