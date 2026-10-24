import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "sundeckpro.test" }) }));

// The server's clients: generateLink answers per address, the throttle per call.
const generateLink = vi.fn();
const rpc = vi.fn();
vi.mock("@/server/admin", () => ({
  adminClient: () => ({ rpc, auth: { admin: { generateLink } } }),
}));
const sent: { to: string; subject: string; text: string; html: string }[] = [];
vi.mock("@/server/email", () => ({
  emailConfigured: () => true,
  sendEmail: async (e: (typeof sent)[number]) => {
    sent.push(e);
    return { id: "e1" };
  },
}));

const {
  newPasswordProblem,
  passwordChangedEmail,
  passwordResetEmail,
  resetLink,
  resetRequestedMessage,
} = await import("../src/lib/password-reset-email");
const { sendPasswordReset } = await import("../src/server/password-reset");
const { POST } = await import("../src/app/api/auth/password-reset/route");

const post = (body: unknown) =>
  POST(
    new Request("https://sundeckpro.test/api/auth/password-reset", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  sent.length = 0;
  rpc.mockReset().mockResolvedValue({ data: true });
  generateLink
    .mockReset()
    .mockImplementation(async ({ email }: { email: string }) =>
      email === "dana@bluewave.test"
        ? { data: { properties: { hashed_token: "hash123" } }, error: null }
        : { data: { properties: null }, error: { message: "User not found" } },
    );
});

describe("the reset email", () => {
  it("links to /auth/confirm with the token, then the new-password page", () => {
    const link = resetLink("https://sundeckpro.com", "abc");
    expect(link).toBe(
      "https://sundeckpro.com/auth/confirm?token_hash=abc&type=recovery&next=%2Freset-password",
    );
    const email = passwordResetEmail(link);
    expect(email.subject).toBe("Reset your Sundeck Pro password");
    expect(email.text).toContain(link);
    expect(email.html).toContain(link.replace(/&/g, "&#38;"));
    expect(email.html).toContain("Choose a New Password");
  });

  it("says what to do when the password changed and it wasn't them", () => {
    const email = passwordChangedEmail({
      signInUrl: "https://sundeckpro.com/sign-in",
      supportEmail: "support@sundeckpro.com",
    });
    expect(email.text).toContain("every other device was signed out");
    expect(email.text).toContain("support@sundeckpro.com");
  });

  it("checks the new password like sign-up: the password rules, typed twice the same", () => {
    expect(newPasswordProblem("short", "short")).toBe("Use at least 10 characters.");
    expect(newPasswordProblem("long enough 1", "long enough 1")).toBe(
      "Add an uppercase letter and a symbol.",
    );
    expect(newPasswordProblem("Long-enough-1", "Long-enough-2")).toBe(
      "The two passwords don’t match.",
    );
    expect(newPasswordProblem("Long-enough-1", "Long-enough-1")).toBeNull();
  });
});

describe("sendPasswordReset", () => {
  it("emails a link to an account's own address", async () => {
    expect(await sendPasswordReset("  Dana@BlueWave.test ")).toBe("sent");
    expect(rpc).toHaveBeenCalledWith("take_password_reset", { target_email: "dana@bluewave.test" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("dana@bluewave.test");
    expect(sent[0]!.text).toContain("token_hash=hash123");
  });

  it("sends nothing for an address with no account", async () => {
    expect(await sendPasswordReset("nobody@x.test")).toBe("no_account");
    expect(sent).toHaveLength(0);
  });

  it("sends nothing past 3 an hour", async () => {
    rpc.mockImplementation(async (fn: string) => ({ data: fn !== "take_password_reset" }));
    expect(await sendPasswordReset("dana@bluewave.test")).toBe("too_many");
    expect(generateLink).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });
});

describe("POST /api/auth/password-reset (the apps' Forgot Password?)", () => {
  it("answers the same whether or not the address has an account", async () => {
    const yes = await post({ email: "dana@bluewave.test" });
    const no = await post({ email: "nobody@x.test" });
    expect(yes.status).toBe(200);
    expect(no.status).toBe(200);
    expect((await yes.json()).message).toBe(resetRequestedMessage("dana@bluewave.test"));
    expect((await no.json()).message).toBe(resetRequestedMessage("nobody@x.test"));
    expect(sent).toHaveLength(1);
  });

  it("asks for an email", async () => {
    const res = await post({ email: "not an email" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Enter your email.");
  });
});

describe("sign-in limits on reset emails", () => {
  it("counts each request by email and visitor, and says when there were too many", async () => {
    rpc.mockImplementation(async (fn: string) => ({
      data: fn === "auth_attempt_allowed" ? false : true,
    }));
    expect(await sendPasswordReset("dana@bluewave.test")).toBe("limited");
    expect(rpc).toHaveBeenCalledWith("auth_attempt_allowed", {
      attempt_kind: "reset",
      target_email: "dana@bluewave.test",
      client_ip: null,
      take: true,
    });
    expect(sent).toHaveLength(0);
    const res = await post({ email: "dana@bluewave.test" });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many attempts. Try again in an hour." });
  });
});
