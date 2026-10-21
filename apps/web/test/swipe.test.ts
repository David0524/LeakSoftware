import { describe, expect, it } from "vitest";
import { lockDirection, rubberBand, swipeOutcome } from "@/components/use-swipe";

// Swiping between pages (gestures.md sections 1 and 4): the rules the pager follows.

describe("lockDirection", () => {
  it("waits for 10 px before deciding", () => {
    expect(lockDirection(6, 3)).toBeNull();
    expect(lockDirection(-9, 9)).toBeNull();
  });
  it("is sideways only when mostly sideways, so scrolling stays scrolling", () => {
    expect(lockDirection(14, 4)).toBe("x");
    expect(lockDirection(-12, 5)).toBe("x");
    expect(lockDirection(8, 16)).toBe("y");
    expect(lockDirection(11, 11)).toBe("y");
  });
});

describe("rubberBand", () => {
  it("gives less and less past the end, never the whole way", () => {
    const w = 400;
    const a = rubberBand(100, w);
    const b = rubberBand(200, w);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(100);
    expect(b - a).toBeLessThan(a);
    expect(rubberBand(10_000, w)).toBeLessThan(w);
    expect(rubberBand(-100, w)).toBeCloseTo(-a);
  });
});

describe("swipeOutcome", () => {
  const base = { width: 400, canPrev: true, canNext: true, velocity: 0 };
  it("turns past a quarter of the width", () => {
    expect(swipeOutcome({ ...base, dx: -120 })).toBe(1);
    expect(swipeOutcome({ ...base, dx: 120 })).toBe(-1);
    expect(swipeOutcome({ ...base, dx: -60 })).toBe(0);
  });
  it("turns on a quick flick the same way, not against it", () => {
    expect(swipeOutcome({ ...base, dx: -40, velocity: -0.8 })).toBe(1);
    expect(swipeOutcome({ ...base, dx: -40, velocity: 0.8 })).toBe(0);
    expect(swipeOutcome({ ...base, dx: -10, velocity: -2 })).toBe(0);
  });
  it("stops at either end", () => {
    expect(swipeOutcome({ ...base, dx: -300, canNext: false })).toBe(0);
    expect(swipeOutcome({ ...base, dx: 300, canPrev: false })).toBe(0);
  });
});
