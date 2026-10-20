import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/origin", () => ({ siteOrigin: async () => "https://sundeckpro.test" }));
const { twilioParams } = await import("../src/server/twilio-route");

// Twilio always posts a signed form; anything else is refused, never a 500 (break testing,
// 2026-10-20).
describe("twilioParams", () => {
  beforeEach(() => vi.stubEnv("TWILIO_AUTH_TOKEN", "12345"));
  afterEach(() => vi.unstubAllEnvs());

  it("answers 400 when the body isn't a form", async () => {
    const r = await twilioParams(
      new Request("https://sundeckpro.test/api/twilio/sms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(400);
  });

  it("answers 403 when the signature doesn't match", async () => {
    const r = await twilioParams(
      new Request("https://sundeckpro.test/api/twilio/sms", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-twilio-signature": "wrong",
        },
        body: "From=%2B15550001111&Body=hi",
      }),
    );
    expect((r as Response).status).toBe(403);
  });
});
