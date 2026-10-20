import { describe, expect, it } from "vitest";
import {
  SAVED_REPORT_SECTIONS,
  applySavedReport,
  replaceSavedReportQuestion,
  savedReportFrom,
  savedReportSections,
} from "../src";

const draft = [
  { key: "summary", title: "Summary", text: "We found a leak." },
  { key: "findings", title: "What we found", text: "" },
  { key: "next_steps", title: "What happens next", text: "Call us." },
];

describe("saved reports", () => {
  it("hold the homeowner report's three sections", () => {
    expect(SAVED_REPORT_SECTIONS.map((s) => s.key)).toEqual(["summary", "findings", "next_steps"]);
  });

  it("keep only known sections with text", () => {
    expect(
      savedReportSections({ summary: " Hi ", findings: "  ", other: "x", next_steps: 4 }),
    ).toEqual({ summary: "Hi" });
    expect(savedReportSections(null)).toEqual({});
    expect(savedReportSections(["x"])).toEqual({});
  });

  it("fill a draft word for word, and name what they replace", () => {
    const r = applySavedReport(draft, {
      summary: "No leak found.",
      findings: "Everything held pressure.",
      next_steps: "Call us.",
    });
    expect(r.sections.map((s) => s.text)).toEqual([
      "No leak found.",
      "Everything held pressure.",
      "Call us.",
    ]);
    // An empty section, or one already saying the same, isn't asked about.
    expect(r.replaces).toEqual(["Summary"]);
    expect(applySavedReport(draft, {}).sections).toEqual(draft);
  });

  it("ask in plain words", () => {
    expect(replaceSavedReportQuestion(["Summary"])).toBe("Replace the text in Summary?");
    expect(replaceSavedReportQuestion(["Summary", "What we found"])).toBe(
      "Replace the text in Summary and What we found?",
    );
    expect(replaceSavedReportQuestion(["A", "B", "C"])).toBe("Replace the text in A, B and C?");
  });

  it("save a draft's text", () => {
    expect(savedReportFrom(draft)).toEqual({ summary: "We found a leak.", next_steps: "Call us." });
  });
});
