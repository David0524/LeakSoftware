import { describe, expect, it } from "vitest";
import { checkSetup, readSetupNeeded, SETUP_NEEDED_KEY } from "../src/lib/setupGate";

// Finish Setting Up Your Account (owner, 2026-10-24: "shops should have to submit a credit card
// for the trial").

function memoryKv() {
  const m = new Map<string, string>();
  return {
    get: (k: string) => m.get(k) ?? null,
    set: (k: string, v: string) => void m.set(k, v),
    remove: (k: string) => void m.delete(k),
  };
}

const answering = (data: unknown, error: { message: string } | null = null) => ({
  calls: 0,
  rpc(this: { calls: number }) {
    this.calls++;
    return Promise.resolve({ data, error });
  },
});

describe("checkSetup", () => {
  it("holds an owner until the shop is set up, and remembers it", async () => {
    const kv = memoryKv();
    const server = answering({ onboarded: false, plan: "standard" });
    expect(await checkSetup(server as never, kv as never, "c1", "owner")).toBe("needed");
    expect(readSetupNeeded(kv as never)).toEqual(["c1"]);
    const done = answering({ onboarded: true, plan: "standard" });
    expect(await checkSetup(done as never, kv as never, "c1", "owner")).toBe("done");
    expect(kv.get(SETUP_NEEDED_KEY)).toBeNull();
  });
  it("keeps the last answer offline, and says why", async () => {
    const kv = memoryKv();
    await checkSetup(answering({ onboarded: false }) as never, kv as never, "c1", "owner");
    const offline = answering(null, { message: "TypeError: Network request failed" });
    expect(await checkSetup(offline as never, kv as never, "c1", "owner")).toBe("offline");
    const broken = answering(null, { message: "500 upstream broke" });
    expect(await checkSetup(broken as never, kv as never, "c1", "owner")).toBe("failed");
    expect(readSetupNeeded(kv as never)).toEqual(["c1"]);
  });
  it("never holds a tech or a demo shop, and doesn't ask for a tech", async () => {
    const kv = memoryKv();
    const server = answering({ onboarded: false, plan: "standard" });
    expect(await checkSetup(server as never, kv as never, "c1", "tech")).toBe("done");
    expect(server.calls).toBe(0);
    const demo = answering({ onboarded: false, plan: "demo" });
    expect(await checkSetup(demo as never, kv as never, "c1", "owner")).toBe("done");
    expect(readSetupNeeded(kv as never)).toEqual([]);
  });
});
