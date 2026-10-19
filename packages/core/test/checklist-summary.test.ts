import { describe, expect, it } from "vitest";
import { checklistSectionSummary, markRemainingLabel } from "../src";

const r = (
  status: "pending" | "inspected" | "excluded",
  outcome?: "ok" | "leaking" | "attention",
) => ({
  result: { status, outcome: outcome ?? null },
});

describe("checklistSectionSummary", () => {
  it("counts what is left and starts open", () => {
    expect(checklistSectionSummary([r("pending"), r("inspected", "ok"), { result: null }])).toEqual(
      {
        text: "2 of 3 to do",
        tone: "muted",
        toDo: 2,
        open: true,
      },
    );
  });
  it("is all clear in green when nothing was found", () => {
    const s = checklistSectionSummary([r("inspected", "ok"), r("excluded")]);
    expect([s.text, s.tone, s.open]).toEqual(["All clear", "pass", false]);
  });
  it("shows attention in the warning color, not green", () => {
    const s = checklistSectionSummary([r("inspected", "attention"), r("inspected", "ok")]);
    expect([s.text, s.tone]).toEqual(["1 attention", "warning"]);
  });
  it("shows leaks in red, with attention beside them", () => {
    const s = checklistSectionSummary([r("inspected", "leaking"), r("inspected", "attention")]);
    expect([s.text, s.tone]).toEqual(["1 leaking · 1 attention", "fail"]);
  });
  it("words pool service lists as done or needing attention", () => {
    expect(checklistSectionSummary([r("inspected", "ok")], true).text).toBe("All done");
    expect(checklistSectionSummary([r("inspected", "attention")], true).text).toBe(
      "1 needs attention",
    );
    expect(
      checklistSectionSummary([r("inspected", "attention"), r("inspected", "attention")], true)
        .text,
    ).toBe("2 need attention");
  });
});

describe("markRemainingLabel", () => {
  it("names the answer the rest get", () => {
    expect(markRemainingLabel(["yes_no", "yes_no"])).toBe("Answer 2 Remaining No");
    expect(markRemainingLabel(["done"])).toBe("Mark 1 Remaining Done");
    expect(markRemainingLabel(["leak", "yes_no"])).toBe("Mark 2 Remaining Not Leaking");
  });
});
