import { describe, expect, it } from "vitest";
import { keyboardInset } from "../src/components/keyboard-inset";

// The phone's keyboard as the page sees it (owner, 2026-10-26: "keyboard covers input fields").
describe("keyboardInset", () => {
  it("is the height the keyboard covers", () => {
    expect(keyboardInset(844, { height: 520, offsetTop: 0 })).toBe(324);
  });

  it("counts the page panned up to show a field", () => {
    expect(keyboardInset(844, { height: 520, offsetTop: 120 })).toBe(204);
  });

  it("is 0 with no keyboard, or only the browser's own bars", () => {
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(844, { height: 790, offsetTop: 0 })).toBe(0);
  });
});
