import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/config", () => ({ API_URL: "https://sundeckpro.test" }));
const { signUpOnServer } = await import("../src/data/sign-up");

// Create an Account (owner, 2026-10-24): through the website, which checks the password rules,
// limits sign-ups, and emails a confirmation link that works on any phone or computer.
describe("Create an Account", () => {
  const request = {
    name: "Dana",
    email: "dana@bluewave.test",
    password: "Pool-Leak-42",
    heard_from: null,
    heard_from_other: null,
  };

  it("posts to the website, signed out, and says when the email must be confirmed", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ confirmEmail: true }));
    expect(await signUpOnServer(request, "https://sundeckpro.test", fetchImpl)).toEqual({
      confirmEmail: true,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sundeckpro.test/api/auth/sign-up");
    expect(JSON.parse(String(init.body))).toEqual(request);
    expect(new Headers(init.headers).has("authorization")).toBe(false);
  });

  it("signs straight in where there's no confirmation", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ confirmEmail: false }));
    expect(await signUpOnServer(request, "https://x.test", fetchImpl)).toEqual({
      confirmEmail: false,
    });
  });

  it("shows the server's reason, the limit included", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ error: "Too many attempts. Try again in an hour." }, { status: 429 }),
    );
    expect(await signUpOnServer(request, "https://x.test", fetchImpl)).toEqual({
      error: "Too many attempts. Try again in an hour.",
    });
  });

  it("says when there's no connection", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Network request failed");
    });
    expect(await signUpOnServer(request, "https://x.test", fetchImpl)).toEqual({
      error: "No connection. Connect to the internet to sign up.",
    });
  });
});
