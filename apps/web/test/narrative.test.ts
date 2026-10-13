import { describe, expect, it } from "vitest";
import { plainNarrative, type Narrative } from "@leakbook/core";
import { PLAIN_MODEL, writeNarrative } from "../src/server/narrative";
import { SNAPSHOT } from "../../../packages/core/test/report.test";

function fakeModel(outputs: unknown[]) {
  const prompts: string[] = [];
  const call = async (_system: string, user: string) => {
    prompts.push(user);
    return outputs.shift();
  };
  return Object.assign(call, { id: "fake-model", prompts });
}

const good = plainNarrative(SNAPSHOT, "homeowner");
const wrongPsi: Narrative = structuredClone(good);
wrongPsi.sections[0]!.paragraphs[0]!.text = "Return 3 dropped 6 psi.";

describe("writeNarrative", () => {
  it("without an AI key, uses the plain draft and says so", async () => {
    const r = await writeNarrative(SNAPSHOT, "homeowner", "", null);
    expect(r.model).toBe(PLAIN_MODEL);
    expect(r.problems).toEqual([]);
  });

  it("retries once, listing the problems, and keeps the fixed draft", async () => {
    const model = fakeModel([wrongPsi, good]);
    const r = await writeNarrative(SNAPSHOT, "homeowner", "Plain words.", model);
    expect(model.prompts).toHaveLength(2);
    expect(model.prompts[1]).toContain("does not match any reading");
    expect(r).toMatchObject({ model: "fake-model", problems: [] });
  });

  it("returns the remaining problems for the tech when the retry still fails", async () => {
    const model = fakeModel([wrongPsi, wrongPsi]);
    const r = await writeNarrative(SNAPSHOT, "homeowner", "", model);
    expect(r.problems).toEqual([
      expect.objectContaining({ kind: "unsupported_number", match: "6" }),
    ]);
    expect(r.narrative).toEqual(wrongPsi);
  });

  it("falls back to the plain draft when the output is unusable", async () => {
    const r = await writeNarrative(SNAPSHOT, "partner", "", fakeModel([null, { nope: 1 }]));
    expect(r.model).toBe(PLAIN_MODEL);
    expect(r.narrative.sections.map((s) => s.key)).toEqual(["summary", "findings", "tests"]);
  });
});
