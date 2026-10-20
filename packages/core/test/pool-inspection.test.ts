import { describe, expect, it } from "vitest";
import {
  choiceOptions,
  foldedItems,
  inspectionAnswerText,
  inspectionAnswerValues,
  inspectionProgress,
  inspectionProgressText,
  inspectionReport,
  intakeQuestionsFor,
  isGate,
  newJobTypes,
  optionsFromText,
  optionsToText,
  plainNarrative,
  reportShareText,
  reportTitle,
  toggleChoice,
  validateNarrative,
  verdictLabel,
  type IntakeQuestion,
  type ReportSnapshot,
  type SnapshotComponent,
} from "../src";

const YES_NO_BAD_NO = [
  { label: "Yes", flag: "ok" },
  { label: "No", flag: "attention" },
];
const LEAK = [
  { label: "Leaking", flag: "leaking" },
  { label: "Not leaking", flag: "ok" },
  { label: "Not applicable", flag: "na" },
];
const FENCE_GATE = [{ label: "Yes" }, { label: "No", fold: true }];
const NOW = new Date("2026-10-20T15:00:00Z");

describe("inspection answers", () => {
  it("reads options, dropping anything malformed", () => {
    expect(
      choiceOptions([
        { label: "Yes", flag: "ok" },
        { label: "" },
        "x",
        { label: "No", flag: "bad", fold: true },
      ]),
    ).toEqual([
      { label: "Yes", flag: "ok" },
      { label: "No", fold: true },
    ]);
    expect(choiceOptions(null)).toEqual([]);
  });

  it("sets the outcome from the option's flag", () => {
    const type = { answer: "choice", options: YES_NO_BAD_NO };
    expect(inspectionAnswerValues(type, "No", "u", NOW)).toMatchObject({
      status: "inspected",
      outcome: "attention",
      value: "No",
      method: "Visual",
      inspected_by: "u",
    });
    expect(inspectionAnswerValues(type, "Yes", "u", NOW).outcome).toBe("ok");
    expect(
      inspectionAnswerValues({ answer: "choice", options: LEAK }, "Leaking", "u", NOW).outcome,
    ).toBe("leaking");
  });

  it("makes not applicable an excluded item, and unflagged answers pass", () => {
    expect(
      inspectionAnswerValues({ answer: "choice", options: LEAK }, "Not applicable", "u", NOW),
    ).toMatchObject({
      status: "excluded",
      outcome: null,
      value: "Not applicable",
    });
    expect(
      inspectionAnswerValues({ answer: "choice", options: FENCE_GATE }, "No", "u", NOW).outcome,
    ).toBe("ok");
  });

  it("answers lists and text, and blanks go back to do", () => {
    expect(inspectionAnswerValues({ answer: "multi" }, ["Spa suctions"], "u", NOW)).toMatchObject({
      status: "inspected",
      outcome: "ok",
      value: ["Spa suctions"],
    });
    expect(inspectionAnswerValues({ answer: "text" }, "  12 PSI ", "u", NOW).value).toBe("12 PSI");
    for (const blank of [null, "", "  ", []])
      expect(inspectionAnswerValues({ answer: "multi" }, blank, "u", NOW)).toMatchObject({
        status: "pending",
        value: null,
        inspected_at: null,
      });
  });

  it("toggles a list in the options' order", () => {
    const options = choiceOptions([{ label: "A" }, { label: "B" }, { label: "C" }]);
    expect(toggleChoice(options, ["C"], "A")).toEqual(["A", "C"]);
    expect(toggleChoice(options, ["A", "C"], "A")).toEqual(["C"]);
  });

  it("shows answers as text, and the checklist label uses them", () => {
    expect(inspectionAnswerText("multi", ["A", "B"])).toBe("A, B");
    expect(inspectionAnswerText("multi", [])).toBeNull();
    expect(inspectionAnswerText("choice", "Yes")).toBe("Yes");
    expect(verdictLabel({ status: "inspected", outcome: "ok", value: ["A"] }, "multi")).toBe("A");
    expect(verdictLabel({ status: "pending", outcome: null }, "choice")).toBe("To do");
  });
});

describe("gates fold their group", () => {
  const rows = [
    {
      id: "fence",
      section: "insp_fencing",
      group_label: "Fencing",
      options: FENCE_GATE,
      value: "No",
    },
    { id: "height", section: "insp_fencing", group_label: "Fencing", options: YES_NO_BAD_NO },
    { id: "slats", section: "insp_fencing", group_label: "Fencing", options: YES_NO_BAD_NO },
    {
      id: "barrier",
      section: "insp_fencing",
      group_label: "Child Proof Barrier",
      options: YES_NO_BAD_NO,
    },
    {
      id: "solar",
      section: "insp_equipment",
      group_label: "Solar",
      options: FENCE_GATE,
      value: "No",
    },
  ];

  it("No folds the rest of the group, and only that group", () => {
    expect([...foldedItems(rows)]).toEqual(["height", "slats"]);
    expect(isGate(rows[0]!)).toBe(true);
    expect(isGate(rows[1]!)).toBe(false);
  });

  it("Yes, or no answer, folds nothing", () => {
    expect(foldedItems(rows.map((r) => (r.id === "fence" ? { ...r, value: "Yes" } : r))).size).toBe(
      0,
    );
    expect(
      foldedItems(rows.map((r) => (r.id === "fence" ? { ...r, value: undefined } : r))).size,
    ).toBe(0);
  });

  it("progress leaves folded questions out", () => {
    const p = inspectionProgress([
      { ...rows[0]!, result: { status: "inspected", outcome: "ok" } },
      { ...rows[1]!, result: { status: "pending", outcome: null } },
      { ...rows[2]!, result: null },
      { ...rows[3]!, result: { status: "inspected", outcome: "attention" } },
    ]);
    expect(p).toEqual({ answered: 2, total: 2, toDo: 0, attention: 1, leaking: 0 });
    expect(inspectionProgressText(p)).toBe("1 needs attention");
    expect(inspectionProgressText({ answered: 12, total: 49, attention: 0, leaking: 0 })).toBe(
      "12 of 49 answered",
    );
    expect(inspectionProgressText({ answered: 3, total: 3, attention: 0, leaking: 0 })).toBe(
      "All answered",
    );
    expect(inspectionProgressText({ answered: 3, total: 3, attention: 2, leaking: 1 })).toBe(
      "1 leaking · 2 need attention",
    );
  });
});

describe("pool inspection jobs", () => {
  it("leak shops offer Pool Inspection after Leak Detection", () => {
    expect(newJobTypes("leak").map((t) => t.label)).toEqual([
      "Leak Detection",
      "Pool Inspection",
      "Repair",
    ]);
    expect(newJobTypes("pool").map((t) => t.value)).toEqual(["maintenance", "repair"]);
    expect(newJobTypes("both").map((t) => t.value)).toEqual([
      "detection",
      "inspection",
      "maintenance",
      "repair",
    ]);
  });

  it("From the Customer asks each job type its own questions", () => {
    const qs: IntakeQuestion[] = [
      { key: "reason", label: "Why they called", type: "multi" },
      { key: "features", label: "Features that apply", type: "multi", job_types: ["inspection"] },
      { key: "both", label: "Both", type: "text", job_types: ["detection", "inspection"] },
    ];
    expect(intakeQuestionsFor(qs, "detection").map((q) => q.key)).toEqual(["reason", "both"]);
    expect(intakeQuestionsFor(qs, "inspection").map((q) => q.key)).toEqual(["features", "both"]);
    expect(intakeQuestionsFor(qs, "repair")).toEqual([]);
  });

  it("names the report for the job", () => {
    expect(reportTitle("inspection")).toBe("Pool Inspection Report");
    expect(reportTitle("detection")).toBe("Leak Detection Report");
    expect(reportShareText("Shop", "L", false, "inspection")).toBe(
      "Shop: your pool inspection report: L",
    );
    expect(reportShareText("Shop", "L")).toBe("Shop: your leak detection report: L");
  });
});

function q(
  id: string,
  label: string,
  section: SnapshotComponent["section"],
  group: string | null,
  over: Partial<SnapshotComponent> = {},
): SnapshotComponent {
  return {
    id,
    result_id: `r-${id}`,
    label,
    type_key: id,
    type_name: label,
    status: "inspected",
    method: "Visual",
    exclusion_reason: null,
    notes: null,
    section,
    answer: "choice",
    outcome: "ok",
    group_label: group,
    options: YES_NO_BAD_NO,
    notice: null,
    value: "Yes",
    ...over,
  };
}

export const INSPECTION: ReportSnapshot = {
  company: {
    name: "Demo Leak Co.",
    legal_name: null,
    phone: null,
    email: null,
    address: "1200 W Example Rd, Phoenix, AZ 85001",
    logo_path: null,
    brand_primary: "#12263A",
    brand_secondary: null,
    timezone: "America/Phoenix",
  },
  customer: { name: "Sam Sample", email: null, phone: null },
  property: { address: "9 Sample Way", pool_type: null, has_spa: true, diagram_shape: null },
  job: {
    id: "job",
    number: 1003,
    type: "inspection",
    started_at: null,
    scheduled_start: null,
    summary_notes: null,
    tech_name: "Tony Tech",
  },
  tests: [],
  findings: [],
  media: [],
  signatures: [],
  component_types: [],
  components: [
    q("f1", "Is the filtration system operating properly?", "insp_equipment", "Filtration System"),
    q("f2", "Does the system show visible leaking?", "insp_equipment", "Filtration System", {
      outcome: "attention",
      notes: "Drip at the union",
      options: [
        { label: "Yes", flag: "attention" },
        { label: "No", flag: "ok" },
      ],
    }),
    q("h1", "The heater is for", "insp_heaters", "Heater", {
      answer: "multi",
      options: [{ label: "Pool only" }, { label: "Spa only" }],
      value: ["Pool only"],
      notice: "FOR ANY UNKNOWN GAS ISSUES - ALWAYS REFER TO A LICENSED GAS COMPANY",
    }),
    q("h2", "Is the heater properly sized?", "insp_heaters", "Heater", {
      status: "pending",
      outcome: null,
      value: null,
    }),
    q("fe1", "Is a perimeter fence present?", "insp_fencing", "Fencing", {
      options: FENCE_GATE,
      value: "No",
      notice:
        "DUE TO ACCIDENTS AND INJURIES, INFORM CUSTOMER THAT CHILD PROOF BARRIERS MUST BE INSTALLED",
    }),
    q("fe2", "Is the fence set to state and local height standards?", "insp_fencing", "Fencing", {
      status: "pending",
      outcome: null,
      value: null,
    }),
    q("p1", "Main drain", "insp_plumbing", null, {
      outcome: "leaking",
      options: LEAK,
      value: "Leaking",
    }),
    q("p2", "Static tested", "insp_plumbing", null, {
      options: LEAK,
      value: "Not leaking",
      notice: "Any EQ line between spa-pool or any vessel structure:",
    }),
  ],
};

describe("the pool inspection report", () => {
  const report = inspectionReport(INSPECTION);

  it("lists what needs attention first, leaking before attention", () => {
    expect(report.needsAttention.map((r) => [r.question, r.answer, r.tone, r.notes])).toEqual([
      ["Main drain", "Leaking", "leaking", null],
      ["Does the system show visible leaking?", "Yes", "attention", "Drip at the union"],
    ]);
  });

  it("shows answered questions by section and group, and folded groups as not present", () => {
    expect(
      report.sections.map((s) => [
        s.title,
        s.groups.map((g) => [g.label, g.notPresent, g.rows.map((r) => r.answer)]),
      ]),
    ).toEqual([
      ["Equipment", [["Filtration System", false, ["Yes", "Yes"]]]],
      ["Heaters", [["Heater", false, ["Pool only"]]]],
      ["Fencing and Child Barriers", [["Fencing", true, ["No"]]]],
      ["Plumbing Static Test", [[null, false, ["Leaking", "Not leaking"]]]],
    ]);
  });

  it("recommends the form's banners, but not a lead-in", () => {
    expect(report.recommendations).toEqual([
      "FOR ANY UNKNOWN GAS ISSUES - ALWAYS REFER TO A LICENSED GAS COMPANY",
      "DUE TO ACCIDENTS AND INJURIES, INFORM CUSTOMER THAT CHILD PROOF BARRIERS MUST BE INSTALLED",
    ]);
  });

  it("Write Draft drafts the summary from the answers, and it passes the checks", () => {
    const draft = plainNarrative(INSPECTION, "homeowner");
    expect(draft.sections.map((s) => s.key)).toEqual(["summary", "findings", "next_steps"]);
    expect(draft.sections[0]!.paragraphs[0]!.text).toBe(
      "We inspected the pool, its equipment, and its safety features, and answered 6 questions. 2 items need attention, 1 of them leaking.",
    );
    expect(draft.sections[1]!.paragraphs.map((p) => p.text)).toEqual([
      "Main drain: Leaking.",
      "Filtration System: Does the system show visible leaking? Yes. Drip at the union.",
    ]);
    expect(draft.sections[2]!.paragraphs.map((p) => p.text)).toEqual([
      "We recommend taking care of the items above. Ask us for a quote for any repair.",
      "FOR ANY UNKNOWN GAS ISSUES - ALWAYS REFER TO A LICENSED GAS COMPANY",
      "DUE TO ACCIDENTS AND INJURIES, INFORM CUSTOMER THAT CHILD PROOF BARRIERS MUST BE INSTALLED",
    ]);
    expect(validateNarrative(draft, INSPECTION)).toEqual([]);
  });

  it("says so when nothing needs attention", () => {
    const fine: ReportSnapshot = {
      ...INSPECTION,
      components: INSPECTION.components.filter(
        (c) => c.outcome !== "attention" && c.outcome !== "leaking",
      ),
    };
    const draft = plainNarrative(fine, "homeowner");
    expect(draft.sections[0]!.paragraphs[0]!.text).toMatch(/Nothing needs attention\.$/);
    expect(draft.sections[1]!.paragraphs[0]!.text).toBe("Everything we inspected was in order.");
    expect(validateNarrative(draft, fine)).toEqual([]);
  });
});

describe("options in Settings", () => {
  it("writes each option on a line with what it means", () => {
    expect(
      optionsToText([
        { label: "Yes", flag: "ok" },
        { label: "No", flag: "attention", fold: true },
        { label: "Leaking", flag: "leaking" },
        { label: "Not applicable", flag: "na" },
      ]),
    ).toBe(
      "Yes\nNo (needs attention, folds the group)\nLeaking (leaking)\nNot applicable (not applicable)",
    );
  });

  it("reads them back, dropping blanks and repeats", () => {
    expect(
      optionsFromText(
        "Yes\n\nNo (Needs attention, folds the group)\nYes\nSand / media\nN/A (not applicable)",
      ),
    ).toEqual([
      { label: "Yes" },
      { label: "No", flag: "attention", fold: true },
      { label: "Sand / media" },
      { label: "N/A", flag: "na" },
    ]);
  });
});
