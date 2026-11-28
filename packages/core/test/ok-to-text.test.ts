import { describe, expect, it } from "vitest";
import { needsTextOk, okToTextValue } from "../src";

describe("OK to Text", () => {
  it("says when it was marked, in the shop's time zone", () => {
    expect(okToTextValue("2026-11-28T06:30:00Z", false, "America/Los_Angeles")).toBe(
      "Yes · Nov 27, 2026",
    );
    expect(okToTextValue(null, false, "America/Phoenix")).toBe("Not yet");
    expect(okToTextValue("2026-11-28T06:30:00Z", true, "America/Phoenix")).toBe("Replied STOP");
  });

  it("reminds only for a known customer who isn't marked and didn't reply STOP", () => {
    expect(needsTextOk({ text_ok_at: null }, false)).toBe(true);
    expect(needsTextOk({ text_ok_at: "2026-11-28T06:30:00Z" }, false)).toBe(false);
    expect(needsTextOk({ text_ok_at: null }, true)).toBe(false);
    expect(needsTextOk(null, false)).toBe(false);
  });
});
