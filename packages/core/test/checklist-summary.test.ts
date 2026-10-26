import { describe, expect, it } from "vitest";
import {
  checklistSectionSummary,
  checklistTallyText,
  inspectionTallyText,
  markRemainingLabel,
  needAttentionText,
} from "../src";

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

describe("tally lines", () => {
  it("leaves out zero counts", () => {
    expect(inspectionTallyText({ answered: 1, total: 133, attention: 0, leaking: 0 })).toBe(
      "1 of 133 answered",
    );
    expect(inspectionTallyText({ answered: 9, total: 12, attention: 1, leaking: 2 })).toBe(
      "9 of 12 answered · 1 needs attention · 2 leaking",
    );
    expect(needAttentionText(3)).toBe("3 need attention");
  });
  it("words maintenance and leak checklists", () => {
    const t = { pass: 3, attention: 0, leaking: 0, notApplicable: 0, pending: 5 };
    expect(checklistTallyText(t, true)).toBe("3 done · 5 to do");
    expect(checklistTallyText(t, true, false)).toBe("3 done");
    expect(checklistTallyText({ ...t, attention: 2, notApplicable: 1 }, true)).toBe(
      "3 done · 2 need attention · 1 skipped · 5 to do",
    );
    expect(checklistTallyText({ ...t, leaking: 1 }, false)).toBe(
      "3 not leaking · 1 leaking · 5 to do",
    );
    expect(checklistTallyText({ ...t, pass: 0, pending: 0 }, false)).toBe("");
  });
});
