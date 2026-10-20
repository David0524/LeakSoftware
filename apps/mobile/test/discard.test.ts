import { describe, expect, it } from "vitest";
import { createLeaveDecider, formChanged } from "../src/lib/discard";

// Discard changes, everywhere (owner, 2026-10-20).

describe("leaving a screen with unsaved changes", () => {
  it("asks once, though several editors on the screen hear the same attempt", () => {
    const d = createLeaveDecider();
    const back = { type: "GO_BACK" };
    expect(d.decide(back, "s1")).toBe("ask");
    expect(d.decide(back, "s1")).toBe("skip");
    expect(d.decide(back, "s1")).toBe("skip");
    // Keep Editing, then back again: a new attempt asks again.
    expect(d.decide({ type: "GO_BACK" }, "s1")).toBe("ask");
  });
  it("goes without asking after a save, and only during it", () => {
    const d = createLeaveDecider();
    let decision = "";
    d.leave("s1", () => {
      decision = d.decide({ type: "GO_BACK" }, "s1");
    });
    expect(decision).toBe("leave");
    expect(d.decide({ type: "GO_BACK" }, "s1")).toBe("ask");
  });
  it("a save on one screen doesn't let another leave", () => {
    const d = createLeaveDecider();
    let other = "";
    d.leave("s1", () => {
      other = d.decide({ type: "NAVIGATE" }, "s2");
    });
    expect(other).toBe("ask");
  });
  it("a save that throws still closes the way out", () => {
    const d = createLeaveDecider();
    expect(() =>
      d.leave("s1", () => {
        throw new Error("no");
      }),
    ).toThrow();
    expect(d.decide({}, "s1")).toBe("ask");
  });
});

describe("what counts as a change", () => {
  it("nothing typed, or only spaces, isn't a change", () => {
    expect(formChanged({ name: "Pat", n: 1 }, { name: "Pat", n: 1 })).toBe(false);
    expect(formChanged({ name: "Pat" }, { name: "Pat  " })).toBe(false);
    expect(formChanged({ notes: "" }, { notes: "\n" })).toBe(false);
  });
  it("a typed word, a switch, a list or a new field is", () => {
    expect(formChanged({ name: "Pat" }, { name: "Pam" })).toBe(true);
    expect(formChanged({ on: true }, { on: false })).toBe(true);
    expect(formChanged({ days: [1, 2] }, { days: [1, 2, 3] })).toBe(true);
    expect(formChanged({}, { extra: "x" })).toBe(true);
    expect(formChanged({ a: null }, {})).toBe(false);
  });
});
