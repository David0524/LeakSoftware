import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/config", () => ({ API_URL: "https://sundeckpro.test" }));
const { requestPasswordReset, resetAddress } = await import("../src/data/password-reset");

// Forgot Password? (owner, 2026-10-22): signed out, the email goes to the website, which
// answers the same whether or not the address has an account.
describe("Forgot Password?", () => {
  it("posts the trimmed email, signed out, and shows the server's answer", async () => {
    const message = "If dana@bluewave.test has a Sundeck Pro account, a reset link is on its way.";
    const fetchImpl = vi.fn(async () => Response.json({ message }));
    const result = await requestPasswordReset(
      " dana@bluewave.test ",
      "https://sundeckpro.test",
      fetchImpl,
    );
    expect(result).toEqual({ message });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sundeckpro.test/api/auth/password-reset");
    expect(JSON.parse(String(init.body))).toEqual({ email: "dana@bluewave.test" });
    expect(new Headers(init.headers).has("authorization")).toBe(false);
  });

  it("asks for an email before sending", async () => {
    const fetchImpl = vi.fn();
    expect(await requestPasswordReset("dana", "https://x.test", fetchImpl)).toEqual({
      error: "Enter your email.",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(resetAddress("a@b.co")).toBe("a@b.co");
  });

  it("says what went wrong: the server's words, or no connection", async () => {
    const down = vi.fn(async () =>
      Response.json({ error: "Email isn’t working right now." }, { status: 503 }),
    );
    expect(await requestPasswordReset("a@b.co", "https://x.test", down)).toEqual({
      error: "Email isn’t working right now.",
    });
    const offline = vi.fn(async () => {
      throw new TypeError("Network request failed");
    });
    expect(await requestPasswordReset("a@b.co", "https://x.test", offline)).toEqual({
      error: "No connection. Try again when you have signal.",
    });
  });
});
