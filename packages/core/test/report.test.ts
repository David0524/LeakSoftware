import { describe, expect, it } from "vitest";
import {
  allowedNumbers,
  leaksNoted,
  narrativeFacts,
  narrativeUserPrompt,
  plainNarrative,
  reportChecklist,
  snapshotTally,
  textOnBrand,
  toFinalSections,
  validateNarrative,
  type Narrative,
  type ReportSnapshot,
  type SnapshotComponent,
} from "../src";

const pressureSchema = {
  fields: [
    { key: "line_name", label: "Line", type: "text" as const },
    { key: "start_psi", label: "Start", type: "number" as const, unit: "PSI" },
    { key: "end_psi", label: "End", type: "number" as const, unit: "PSI" },
    { key: "duration_min", label: "Duration", type: "number" as const, unit: "min" },
  ],
  options: { pass_max_drop_psi: 0, min_duration_min: 15 },
};

function comp(
  id: string,
  label: string,
  type_key: string,
  type_name: string,
  over: Partial<SnapshotComponent> = {},
): SnapshotComponent {
  return {
    id,
    result_id: `r-${id}`,
    label,
    type_key,
    type_name,
    status: "inspected",
    method: "Pressure test",
    exclusion_reason: null,
    notes: null,
    ...over,
  };
}

/** Shaped like the sample job: four returns, Return 3 fails, a major and a minor finding. */
export const SNAPSHOT: ReportSnapshot = {
  company: {
    name: "Demo Leak Co.",
    legal_name: null,
    phone: "(602) 555-0142",
    email: "office@demo.test",
    address: "1200 W Example Rd, Phoenix, AZ 85001",
    logo_path: null,
    brand_primary: "#12263A",
    brand_secondary: null,
    timezone: "America/Phoenix",
  },
  customer: { name: "Sam Sample", email: "sam@example.com", phone: null },
  property: {
    address: "9 Sample Way, Scottsdale, AZ 85251",
    pool_type: "gunite_plaster",
    has_spa: true,
    diagram_shape: "kidney",
  },
  job: {
    id: "job",
    number: 1002,
    type: "detection",
    started_at: null,
    scheduled_start: null,
    summary_notes: "Losing about an inch a day.",
    tech_name: "Tony Tech",
  },
  components: [
    comp("s1", "Skimmer 1", "skimmer", "Skimmer"),
    comp("r1", "Return 1", "return", "Return"),
    comp("r2", "Return 2", "return", "Return"),
    comp("r3", "Return 3", "return", "Return"),
    comp("r4", "Return 4", "return", "Return"),
    comp("md1", "Main drain 1", "main_drain", "Main drain", {
      status: "excluded",
      method: null,
      exclusion_reason: "No diver on site",
    }),
    comp("l1", "Light 1", "light", "Light", { method: "Dye test" }),
  ],
  tests: [
    {
      id: "t-r3",
      type_key: "pressure",
      type_name: "Pressure test",
      calculator: "pressure_drop",
      field_schema: pressureSchema,
      component_id: "r3",
      data: { line_name: "Return 3", start_psi: 20, end_psi: 12, duration_min: 15 },
      outcome: "fail",
      performed_at: null,
      notes: null,
    },
    {
      id: "t-r1",
      type_key: "pressure",
      type_name: "Pressure test",
      calculator: "pressure_drop",
      field_schema: pressureSchema,
      component_id: "r1",
      data: { line_name: "Return 1", start_psi: 20, end_psi: 20, duration_min: 15 },
      outcome: "pass",
      performed_at: null,
      notes: null,
    },
  ],
  findings: [
    {
      id: "f-major",
      title: "Return 3 line break",
      severity_key: "major",
      severity_name: "Major",
      severity_color: "#C62F2B",
      must_mention: true,
      location_text: "Under the deck",
      component_id: "r3",
      pin_x: 0.42,
      pin_y: 0.18,
      status: "open",
      notes: null,
    },
    {
      id: "f-minor",
      title: "Light niche seal worn",
      severity_key: "minor",
      severity_name: "Minor",
      severity_color: "#5B6B7A",
      must_mention: false,
      location_text: null,
      component_id: "l1",
      pin_x: 0.81,
      pin_y: 0.66,
      status: "monitor",
      notes: null,
    },
  ],
  media: [],
  signatures: [],
  component_types: [
    { key: "skimmer", name: "Skimmer" },
    { key: "return", name: "Return" },
    { key: "main_drain", name: "Main drain" },
    { key: "light", name: "Light" },
    { key: "spa", name: "Spa" },
    { key: "equipment_pad", name: "Equipment pad" },
  ],
};

const good: Narrative = {
  sections: [
    {
      key: "summary",
      title: "Summary",
      paragraphs: [
        {
          text: "We found a leak in the Return 3 line. It dropped 8 PSI in 15 minutes during the pressure test.",
          source_ids: ["f-major", "t-r3"],
        },
      ],
    },
    {
      key: "findings",
      title: "What we found",
      paragraphs: [
        { text: "The Return 3 line is broken under the deck.", source_ids: ["f-major"] },
        {
          text: "The light niche seal is worn; we will keep an eye on it.",
          source_ids: ["f-minor"],
        },
      ],
    },
    {
      key: "next_steps",
      title: "What happens next",
      paragraphs: [
        { text: "Main drain 1 was not inspected: no diver on site.", source_ids: ["r-md1"] },
      ],
    },
  ],
};

describe("validateNarrative", () => {
  it("accepts a draft that sticks to the job data", () => {
    expect(validateNarrative(good, SNAPSHOT)).toEqual([]);
  });

  it("rejects an invented finding (unknown source, component not on the job)", () => {
    const draft: Narrative = {
      sections: [
        ...good.sections,
        {
          key: "extra",
          title: "Extra",
          paragraphs: [
            {
              text: "We also found a crack at Skimmer 2 and a leaking spa jet.",
              source_ids: ["f-invented"],
            },
          ],
        },
      ],
    };
    const problems = validateNarrative(draft, SNAPSHOT);
    expect(problems.map((p) => p.kind).sort()).toEqual([
      "unknown_component",
      "unknown_component",
      "unknown_source",
    ]);
    expect(problems.find((p) => p.kind === "unknown_source")).toMatchObject({
      section: "extra",
      paragraph: 0,
      match: "f-invented",
    });
    expect(problems.filter((p) => p.kind === "unknown_component").map((p) => p.match)).toEqual([
      "Skimmer 2",
      "spa",
    ]);
  });

  it("rejects a wrong reading even when the number appears elsewhere", () => {
    const draft = structuredClone(good);
    // 6 is a count on this job (six items inspected), but not a pressure reading.
    draft.sections[0]!.paragraphs[0]!.text = "Return 3 lost 6 psi over 15 minutes.";
    expect(validateNarrative(draft, SNAPSHOT)).toEqual([
      expect.objectContaining({ kind: "unsupported_number", match: "6" }),
    ]);
  });

  it("rejects a wrong PSI reading", () => {
    const draft = structuredClone(good);
    draft.sections[0]!.paragraphs[0]!.text =
      "We found a leak in the Return 3 line. It dropped 7 PSI in 15 minutes.";
    const problems = validateNarrative(draft, SNAPSHOT);
    expect(problems).toEqual([
      expect.objectContaining({ kind: "unsupported_number", match: "7", section: "summary" }),
    ]);
  });

  it("rejects a draft that leaves out a major finding", () => {
    const draft: Narrative = {
      sections: [
        {
          key: "summary",
          title: "Summary",
          paragraphs: [{ text: "The light niche seal is worn.", source_ids: ["f-minor"] }],
        },
      ],
    };
    expect(validateNarrative(draft, SNAPSHOT)).toEqual([
      expect.objectContaining({ kind: "missing_finding", match: "Return 3 line break" }),
    ]);
  });

  it("rejects malformed output", () => {
    expect(validateNarrative({}, SNAPSHOT)[0]!.kind).toBe("bad_shape");
    expect(validateNarrative(null, SNAPSHOT)[0]!.kind).toBe("bad_shape");
  });

  it("allows numbers written with fewer decimals and counts", () => {
    const allowed = allowedNumbers(SNAPSHOT);
    expect(allowed).toEqual(expect.arrayContaining([20, 12, 15, 8, 7, 4, 2, 1]));
    const draft = structuredClone(good);
    draft.sections[0]!.paragraphs[0]!.text =
      "We checked 7 items, ran 2 tests, and tested 4 returns. Return 3 lost 8.0 PSI from 20 psi in 15 minutes.";
    expect(validateNarrative(draft, SNAPSHOT)).toEqual([]);
  });
});

describe("narrative inputs", () => {
  it("gives the model only job facts with ids", () => {
    const facts = narrativeFacts(SNAPSHOT);
    expect(facts.checklist.find((c) => c.component === "Main drain 1")).toMatchObject({
      id: "r-md1",
      result: "Not applicable",
      reason_not_applicable: "No diver on site",
    });
    expect(facts.tests[0]).toMatchObject({
      id: "t-r3",
      result: "Dropped 8 PSI in 15 min",
      outcome: "fail",
    });
    expect(JSON.stringify(facts)).not.toContain("Sam Sample");
    const prompt = narrativeUserPrompt(SNAPSHOT, "homeowner", "Plain words.", ["Fix this."]);
    expect(prompt).toContain('next_steps ("What happens next")');
    expect(prompt).toContain("- Fix this.");
  });

  it("the plain draft passes its own validator for both templates", () => {
    for (const t of ["homeowner", "partner"] as const) {
      const draft = plainNarrative(SNAPSHOT, t);
      expect(validateNarrative(draft, SNAPSHOT), t).toEqual([]);
      expect(toFinalSections(draft).map((s) => s.key)).toEqual(
        t === "partner" ? ["summary", "findings", "tests"] : ["summary", "findings", "next_steps"],
      );
    }
    const partner = toFinalSections(plainNarrative(SNAPSHOT, "partner"));
    expect(partner[2]!.text).toContain("Pressure test, Return 3: Dropped 8 PSI in 15 min (fail).");
    expect(partner[2]!.text).toContain("Main drain 1 (No diver on site)");
  });
});

describe("textOnBrand", () => {
  it("picks the readable text color for the shop's color", () => {
    expect(textOnBrand("#12263A")).toBe("#FFFFFF");
    expect(textOnBrand("#FFD60A")).toBe("#12263A");
    expect(textOnBrand("#EE6A1F")).toBe("#12263A");
  });
});

describe("reportChecklist", () => {
  const verdicts: ReportSnapshot = {
    ...SNAPSHOT,
    components: [
      comp("eq", "Equipment area", "equipment_area", "Equipment area", {
        section: "visual",
        outcome: "ok",
      }),
      comp("vs", "If vinyl, is vinyl stretched?", "vinyl_stretched", "Vinyl stretched", {
        section: "visual",
        answer: "yes_no",
        outcome: "attention",
      }),
      comp("sk", "Skimmer seam 1", "skimmer_seam", "Skimmer seam", {
        section: "plumbing",
        outcome: "leaking",
        location_text: " Seam at the throat ",
      }),
      comp("md", "Main drain 1", "main_drain", "Main drain", {
        section: "plumbing",
        status: "excluded",
        exclusion_reason: null,
      }),
      comp("af", "Autofill", "autofill", "Autofill", { section: "bond_beam", status: "pending" }),
    ],
  };

  it("lists every item with its badge, by section in checklist order", () => {
    const sections = reportChecklist(verdicts)!;
    expect(sections.map((x) => x.title)).toEqual([
      "Visual Leak Inspection",
      "Plumbing Static Test",
      "Bond Beam",
    ]);
    expect(sections.flatMap((x) => x.items.map((i) => [i.label, i.verdict, i.tone]))).toEqual([
      ["Equipment area", "Not leaking", "pass"],
      ["If vinyl, is vinyl stretched?", "Yes", "attention"],
      ["Skimmer seam 1", "Leaking", "leaking"],
      ["Main drain 1", "Not applicable", "not_applicable"],
      ["Autofill", "Not checked", "pending"],
    ]);
    expect(sections[1]!.items[0]!.where).toBe("Seam at the throat");
  });

  it("notes the leaks and counts the tiles", () => {
    expect(leaksNoted(verdicts)).toEqual(["Skimmer seam 1 (Seam at the throat)"]);
    expect(snapshotTally(verdicts)).toEqual({
      pass: 1,
      attention: 1,
      leaking: 1,
      notApplicable: 1,
      pending: 1,
    });
  });

  it("leaves reports frozen before verdicts as they were", () => {
    expect(reportChecklist(SNAPSHOT)).toBeNull();
  });
});
