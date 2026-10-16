import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendText,
  searchNumbers,
  twilioSignature,
  validTwilioRequest,
  xml,
} from "../src/server/twilio";

// Twilio over its REST API (company texting, owner 2026-10-16).

const PARAMS = {
  CallSid: "CA1234567890ABCDE",
  Caller: "+12349013030",
  Digits: "1234",
  From: "+12349013030",
  To: "+18005551212",
};
const URL = "https://mycompany.com/myapp.php?foo=1&bar=2";

describe("webhook signatures", () => {
  beforeEach(() => vi.stubEnv("TWILIO_AUTH_TOKEN", "12345"));
  afterEach(() => vi.unstubAllEnvs());

  it("match Twilio's own example", () => {
    expect(twilioSignature(URL, PARAMS)).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
    expect(validTwilioRequest(URL, PARAMS, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=")).toBe(true);
  });

  it("refuse a changed parameter, a missing signature, or a server without a token", () => {
    expect(
      validTwilioRequest(URL, { ...PARAMS, Digits: "9" }, "0/KCTR6DLpKmkAf8muzZqo1nDgQ="),
    ).toBe(false);
    expect(validTwilioRequest(URL, PARAMS, null)).toBe(false);
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    expect(validTwilioRequest(URL, PARAMS, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=")).toBe(false);
  });
});

describe("without a Twilio account (demo)", () => {
  beforeEach(() => vi.stubEnv("TWILIO_ACCOUNT_SID", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("saves texts as sent without sending them", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const sent = await sendText({ from: "+16025550111", to: "+16025550142", body: "Hi" });
    expect(sent.status).toBe("sent");
    expect(sent.sid).toMatch(/^demo-/);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it("offers made-up 555-01xx numbers in the area code", async () => {
    const numbers = await searchNumbers("602");
    expect(numbers.map((n) => n.number)).toEqual(["+16025550111", "+16025550123", "+16025550147"]);
    await expect(searchNumbers("12")).rejects.toThrow("3-digit area code");
  });
});

it("escapes text for TwiML", () => {
  expect(xml(`Pool & Spa <"Joe's">`)).toBe("Pool &#38; Spa &#60;&#34;Joe&#39;s&#34;&#62;");
});
