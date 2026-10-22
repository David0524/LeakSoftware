import { describe, expect, it } from "vitest";
import {
  REPAIR_SECTIONS,
  plainNarrative,
  repairNarrative,
  repairWork,
  reportShareText,
  reportTitle,
  toFinalSections,
  validateNarrative,
  type ReportSnapshot,
  type SnapshotFinding,
} from "../src";

// A repair job's report (owner, 2026-10-22: "For the repair reports, the autofilled text should
// relate to the repair work that is being done - not necessarily leaks").

function finding(over: Partial<SnapshotFinding>): SnapshotFinding {
  return {
    id: "f1",
    title: "Cracked skimmer lid",
    severity_key: "minor",
    severity_name: "Minor",
    severity_color: "#5B6B7A",
    must_mention: false,
    location_text: null,
    component_id: null,
    pin_x: null,
    pin_y: null,
    status: "open",
    notes: null,
    ...over,
  };
}

/** A repair job made from an accepted quote: no checklist, its quote's lines as the work. */
const REPAIR: ReportSnapshot = {
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
    number: 1003,
    type: "repair",
    started_at: null,
    scheduled_start: null,
    summary_notes: null,
    tech_name: "Tony Tech",
  },
  components: [],
  tests: [],
  findings: [],
  media: [],
  signatures: [],
  component_types: [
    { key: "skimmer", name: "Skimmer" },
    { key: "return", name: "Return" },
    { key: "main_drain", name: "Main drain" },
    { key: "light", name: "Light" },
  ],
  work: [
    { description: "Replace main drain cover", quantity: 1 },
    { description: "Pool light bulb", quantity: 2 },
  ],
};

const text = (s: ReportSnapshot) =>
  Object.fromEntries(toFinalSections(plainNarrative(s, "homeowner")).map((x) => [x.key, x]));

describe("a repair job's report", () => {
  it("is titled and shared as a repair report; other reports don't change", () => {
    expect(reportTitle("repair")).toBe("Repair Report");
    expect(reportShareText("Shop", "L", false, "repair")).toBe("Shop: your repair report: L");
    expect(reportTitle("detection")).toBe("Leak Detection Report");
    expect(reportTitle(null)).toBe("Leak Detection Report");
    expect(reportTitle("inspection")).toBe("Pool Inspection Report");
    expect(reportShareText("Shop", "L")).toBe("Shop: your leak detection report: L");
  });

  it("drafts the work done, where, and the result, with no leak words", () => {
    const t = text(REPAIR);
    expect(Object.values(t).map((x) => x.title)).toEqual([
      "Summary",
      "What we did",
      "What happens next",
    ]);
    expect(REPAIR_SECTIONS.map((x) => x.key)).toEqual(["summary", "findings", "next_steps"]);
    expect(t.summary!.text).toBe(
      "We did the repair work at 9 Sample Way, Scottsdale, AZ 85251: Replace main drain cover and Pool light bulb. The work is finished.",
    );
    expect(t.findings!.text).toBe("Replace main drain cover.\n\nPool light bulb × 2.");
    expect(t.next_steps!.text).toBe(
      "Run the pool as usual and keep an eye on the repaired area over the next few days. Call us if anything doesn’t look or work right.",
    );
    expect(JSON.stringify(t).toLowerCase()).not.toContain("leak");
    // The partner template is gone (2026-10-18); a repair drafts the same either way.
    expect(plainNarrative(REPAIR, "partner")).toEqual(plainNarrative(REPAIR, "homeowner"));
  });

  it("passes its own validator, though it names parts that aren't on a checklist", () => {
    expect(validateNarrative(repairNarrative(REPAIR), REPAIR)).toEqual([]);
    // A part the job's records don't name is still caught.
    const invented = {
      sections: [
        {
          key: "summary",
          title: "Summary",
          paragraphs: [{ text: "We fixed the skimmer.", source_ids: [] }],
        },
      ],
    };
    expect(validateNarrative(invented, REPAIR).map((p) => p.kind)).toEqual(["unknown_component"]);
    // A quantity or number the job doesn't have is caught too.
    const number = {
      sections: [
        {
          key: "summary",
          title: "Summary",
          paragraphs: [{ text: "Pool light bulb × 3.", source_ids: [] }],
        },
      ],
    };
    expect(validateNarrative(number, REPAIR).map((p) => p.kind)).toEqual(["unsupported_number"]);
  });

  it("names the findings repaired on site and the ones still open", () => {
    const s: ReportSnapshot = {
      ...REPAIR,
      findings: [
        finding({
          id: "f-done",
          title: "Light niche gasket worn",
          status: "repaired",
          location_text: "Deep end",
          notes: "Replaced the gasket",
        }),
        finding({ id: "f-open", title: "Cracked skimmer lid", must_mention: true }),
      ],
    };
    const t = text(s);
    expect(t.summary!.text).toBe(
      "We did the repair work at 9 Sample Way, Scottsdale, AZ 85251: Replace main drain cover and Pool light bulb. We also repaired Light niche gasket worn on site. Cracked skimmer lid still needs attention.",
    );
    expect(t.findings!.text).toBe(
      [
        "Replace main drain cover.",
        "Pool light bulb × 2.",
        "Light niche gasket worn: repaired on site. Location: Deep end. Replaced the gasket.",
        "Cracked skimmer lid (minor): not repaired yet.",
      ].join("\n\n"),
    );
    expect(t.next_steps!.text.startsWith("We recommend taking care of the items above.")).toBe(
      true,
    );
    expect(validateNarrative(repairNarrative(s), s)).toEqual([]);
  });

  it("falls back to the job's notes, then a plain line, never inventing work", () => {
    const notes: ReportSnapshot = {
      ...REPAIR,
      work: undefined,
      job: { ...REPAIR.job, summary_notes: "Pump is loud" },
    };
    expect(repairWork(notes)).toEqual([]);
    const t = text(notes);
    expect(t.summary!.text).toBe(
      "We did repair work at 9 Sample Way, Scottsdale, AZ 85251. The work is finished.",
    );
    expect(t.findings!.text).toBe("Pump is loud.");
    expect(validateNarrative(repairNarrative(notes), notes)).toEqual([]);

    const bare: ReportSnapshot = { ...notes, job: { ...notes.job, summary_notes: null } };
    expect(text(bare).findings!.text).toBe("We did the repair work you booked.");
    // A blank line from the quote is left out.
    expect(repairWork({ work: [{ description: "  ", quantity: 1 }] })).toEqual([]);
  });

  it("speaks of leaks only when the job's own records do", () => {
    const s: ReportSnapshot = {
      ...REPAIR,
      work: [{ description: "Repair leak at return line", quantity: 1 }],
    };
    expect(text(s).next_steps!.text).toContain(
      "Watch the water level too, and call us if it keeps dropping.",
    );
    expect(validateNarrative(repairNarrative(s), s)).toEqual([]);
  });

  it("leaves leak detection and pool inspection drafts as they were", () => {
    const detection = { ...REPAIR, job: { ...REPAIR.job, type: "detection" }, work: undefined };
    expect(toFinalSections(plainNarrative(detection, "homeowner")).map((x) => x.title)).toEqual([
      "Summary",
      "What we found",
      "What happens next",
    ]);
  });
});
