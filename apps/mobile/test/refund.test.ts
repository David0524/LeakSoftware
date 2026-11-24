import { afterEach, describe, expect, it, vi } from "vitest";

// Refunds (owner, 2026-11-24): Refund Payment posts to the server as the website's and the
// iPhone's do, an amount for part or nothing for all that's left, then syncs the change down.
// The app's services, React Native and the network are stand-ins.

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("../src/lib/config", () => ({ API_URL: "https://sundeck.test" }));
vi.mock("../src/lib/usage-errors", () => ({ noteError: () => {} }));
vi.mock("../src/data/hooks", () => ({ useRows: () => [], useJobRows: () => [] }));
const sync = {
  syncNow: vi.fn(async () => {}),
  accessToken: vi.fn(async (): Promise<string | null> => "token"),
};
vi.mock("../src/lib/services", () => ({ getServices: () => ({ sync }) }));

const { refundPayment, refundRequestBody } = await import("../src/data/invoices");

afterEach(() => {
  vi.unstubAllGlobals();
  sync.syncNow.mockClear();
});

function stubFetch(status: number, body: unknown) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("refundRequestBody", () => {
  it("sends the amount for part, and nothing for all that's left", () => {
    expect(refundRequestBody(2000)).toEqual({ amount_cents: 2000 });
    expect(refundRequestBody(null)).toEqual({});
  });
});

describe("refundPayment", () => {
  it("posts with the phone's sign-in and syncs the payment down", async () => {
    const fetch = stubFetch(200, {
      refunded_cents: 2000,
      status: "succeeded",
      message: "Refunded $20.00.",
    });
    const r = await refundPayment("pay-1", 2000);
    expect(r.message).toBe("Refunded $20.00.");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://sundeck.test/api/payments/pay-1/refund");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ authorization: "Bearer token" });
    expect(JSON.parse(init.body as string)).toEqual({ amount_cents: 2000 });
    expect(sync.syncNow).toHaveBeenCalled();
  });

  it("refunds all that's left with an empty body", async () => {
    const fetch = stubFetch(200, { refunded_cents: 8000, status: "refunded", message: "x" });
    await refundPayment("pay-2", null);
    expect(JSON.parse(fetch.mock.calls[0]![1].body as string)).toEqual({});
  });

  it("says the server's error", async () => {
    stubFetch(400, { error: "Refund $80.00 or less." });
    await expect(refundPayment("pay-3", 9000)).rejects.toThrow("Refund $80.00 or less.");
    expect(sync.syncNow).not.toHaveBeenCalled();
  });
});
