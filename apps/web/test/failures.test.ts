import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailNotConfigured } from "../src/server/email";
import { Refusal, dbFailure, failureStatus } from "../src/server/failures";
import { TextingError } from "../src/server/texting";

// The phones keep a queued send on 401/408/429/5xx and drop it on any other 4xx
// (apps/mobile/src/data/reports.ts tryAgainLater): only real refusals may answer 400.
describe("failureStatus", () => {
  it("answers 400 for refusals", () => {
    expect(failureStatus(new Refusal("Enter the customer’s email."))).toBe(400);
    expect(failureStatus(new EmailNotConfigured())).toBe(400);
    expect(failureStatus(new TextingError("No company number."))).toBe(400);
  });

  it("answers 500 for faults", () => {
    expect(failureStatus(new Error("TypeError: fetch failed"))).toBe(500);
    expect(failureStatus(new TypeError("Cannot read properties of null"))).toBe(500);
    expect(failureStatus("boom")).toBe(500);
  });

  it("tells a database refusal from a database fault", () => {
    for (const code of ["42501", "23505", "P0001", "22P02", "PGRST116"])
      expect(failureStatus(dbFailure({ message: "no", code }))).toBe(400);
    for (const code of ["", null, undefined, "PGRST001", "PGRST205", "57014", "08006"])
      expect(failureStatus(dbFailure({ message: "down", code }))).toBe(500);
    expect(dbFailure({ message: "row security", code: "42501" }).message).toBe("row security");
  });
});

const session = vi.fn();
const sendReport = vi.fn();
vi.mock("@/server/bearer", () => ({
  clientFromRequest: async () => session(),
  jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
}));
vi.mock("@/server/reports", () => ({ sendReport: (...a: unknown[]) => sendReport(...a) }));
vi.mock("@/lib/origin", () => ({ siteOrigin: async () => "https://sundeckpro.test" }));

const route = await import("../src/app/api/reports/[id]/send/route");
const send = () =>
  route.POST(
    new Request("https://sundeckpro.test/api/reports/r1/send", {
      method: "POST",
      body: JSON.stringify({ channel: "sms_device" }),
    }),
    { params: Promise.resolve({ id: "r1" }) } as never,
  );

describe("POST /api/reports/[id]/send", () => {
  beforeEach(() => {
    session.mockReset().mockResolvedValue({});
    sendReport.mockReset();
  });

  it("keeps 400 and the message for a refusal", async () => {
    sendReport.mockRejectedValue(new Refusal("A newer version of this report has been sent."));
    const res = await send();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "A newer version of this report has been sent." });
  });

  it("answers 500 for a server fault, so the phone tries again later", async () => {
    sendReport.mockRejectedValue(dbFailure({ message: "TypeError: fetch failed", code: "" }));
    const res = await send();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "TypeError: fetch failed" });
  });
});
