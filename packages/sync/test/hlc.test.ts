import { describe, expect, it } from "vitest";
import { HybridClock, compareHlc, formatHlc, parseHlc } from "../src";

describe("HybridClock", () => {
  it("formats sortable strings", () => {
    expect(formatHlc(1700000000000, 3, "dev1")).toBe("1700000000000-0003-dev1");
    expect(parseHlc("1700000000000-0003-dev1")).toEqual({
      ms: 1700000000000,
      counter: 3,
      deviceId: "dev1",
    });
    expect(() => parseHlc("bad")).toThrow();
  });

  it("increases even when the wall clock stands still or goes back", () => {
    let wall = 1000;
    const c = new HybridClock("d", undefined, () => wall);
    const a = c.tick();
    const b = c.tick();
    wall = 500;
    const d = c.tick();
    expect(compareHlc(a, b)).toBe(-1);
    expect(compareHlc(b, d)).toBe(-1);
  });

  it("moves past remote timestamps from the future", () => {
    const c = new HybridClock("d", undefined, () => 1000);
    c.receive("0000000005000-0002-server");
    expect(compareHlc(c.tick(), "0000000005000-0002-server")).toBe(1);
  });

  it("ignores older remote timestamps", () => {
    const c = new HybridClock("d", undefined, () => 9000);
    c.tick();
    c.receive("0000000001000-0000-server");
    expect(c.state.ms).toBe(9000);
  });

  it("rolls into the next millisecond when the counter is exhausted", () => {
    const c = new HybridClock("d", { ms: 1000, counter: 9999 }, () => 1000);
    expect(c.tick()).toBe("0000000001001-0000-d");
  });

  it("rejects device ids that would break the format", () => {
    expect(() => new HybridClock("a-b")).toThrow();
  });
});
