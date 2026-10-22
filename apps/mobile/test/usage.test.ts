import { describe, expect, it, vi } from "vitest";
import { UsageRecorder, type UsageSink } from "../src/data/usage";

// Usage for the Admin portal (owner, 2026-10-22): screen time only while the app is in front,
// errors on the screen they happened on, and nothing lost when there's no signal.
describe("UsageRecorder", () => {
  function recorder() {
    let t = Date.parse("2026-10-22T15:00:00Z");
    const r = new UsageRecorder("android", "1.4.0", () => t);
    return { r, advance: (ms: number) => (t += ms) };
  }

  it("counts time on a screen only while the app is in front", async () => {
    const { r, advance } = recorder();
    r.screenChanged("/today");
    advance(60_000);
    r.foreground(false); // locked the phone
    advance(10 * 60_000);
    r.foreground(true);
    advance(30_000);
    r.screenChanged("/jobs/0192f0a0-0000-7000-8000-00000000abcd");
    expect(r.pending.map((e) => [e.screen, e.ms])).toEqual([
      ["/today", 60_000],
      ["/today", 30_000],
    ]);
    r.error("Couldn’t save the photo");
    expect(r.pending.at(-1)).toMatchObject({
      kind: "error",
      screen: "/jobs/0192f0a0-0000-7000-8000-00000000abcd",
      detail: "Couldn’t save the photo",
    });
  });

  it("starts a new session after 30 minutes away", () => {
    const { r, advance } = recorder();
    r.screenChanged("/today");
    advance(5_000);
    r.foreground(false);
    advance(31 * 60_000);
    r.foreground(true);
    advance(5_000);
    r.foreground(false);
    const [a, b] = r.pending;
    expect(a!.session).not.toBe(b!.session);
  });

  it("keeps what couldn't be sent, and sends it with the shop and version", async () => {
    const { r, advance } = recorder();
    r.screenChanged("/today");
    advance(5_000);
    r.screenChanged("/schedule");
    const down: UsageSink = { send: vi.fn(async () => false) };
    await r.flush(down, "token", "c1");
    expect(r.pending).toHaveLength(1);
    const up: UsageSink = { send: vi.fn(async () => true) };
    await r.flush(up, "token", "c1");
    expect(r.pending).toHaveLength(0);
    const [body, token] = (up.send as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(token).toBe("token");
    expect(JSON.parse(body)).toMatchObject({
      platform: "android",
      version: "1.4.0",
      company_id: "c1",
    });
  });
});
