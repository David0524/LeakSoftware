import { describe, expect, it } from "vitest";
import { PLAIN_MODEL, writeNarrative } from "../src/server/narrative";
import { SNAPSHOT } from "../../../packages/core/test/report.test";

// Drafts are written from the job's facts, with no AI (owner, 2026-10-18).
describe("writeNarrative", () => {
  it("writes the plain draft from the job facts, which passes its own checks", () => {
    for (const template of ["homeowner", "partner"] as const) {
      const r = writeNarrative(SNAPSHOT, template);
      expect(r.model).toBe(PLAIN_MODEL);
      expect(r.problems).toEqual([]);
      expect(r.narrative.sections.length).toBeGreaterThan(0);
    }
  });
});
