import { describe, expect, it } from "vitest";
import { SAMPLE_PILL, isSample, sampleSentText, withoutSample } from "../src";

describe("the sample job (owner, 2026-10-22)", () => {
  it("is marked only by the server's flag", () => {
    expect(isSample({ sample: true })).toBe(true);
    expect(isSample({ sample: false })).toBe(false);
    expect(isSample({})).toBe(false);
    expect(isSample(null)).toBe(false);
    expect(SAMPLE_PILL).toBe("Sample");
  });

  it("is never counted", () => {
    const jobs = [{ id: "a" }, { id: "s", sample: true }, { id: "b", sample: false }];
    expect(withoutSample(jobs).map((j) => j.id)).toEqual(["a", "b"]);
  });

  it("says where the report went", () => {
    expect(sampleSentText("owner@shop.com")).toBe(
      "Sent to owner@shop.com. Open it the way your customers will.",
    );
  });
});
