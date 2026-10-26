import { describe, expect, it } from "vitest";
import {
  invoiceSummary,
  leakSummary,
  monthSummary,
  reportByLine,
  reportHeroPhoto,
  techFirstName,
  techFirstNames,
  visitSummary,
  type ReportSnapshot,
  type VisitSummaryInput,
} from "../src";

/** Just the parts of a snapshot the summaries read: Return 3 and a light, two findings. */
const SNAPSHOT = {
  job: { type: "detection" },
  components: [
    { id: "r1", label: "Return 1", status: "inspected", outcome: "ok" },
    { id: "r3", label: "Return 3", status: "inspected", outcome: "attention" },
    { id: "md", label: "Main drain", status: "excluded", outcome: null },
  ],
  findings: [{ id: "f1" }, { id: "f2" }],
} as unknown as ReportSnapshot;

const done = [{ status: "inspected" as const }, { status: "inspected" as const }];
const inRange = { fc: 3, ph: 7.5, ta: 90, ch: 300, cya: 40 };

const visit = (over: Partial<VisitSummaryInput> & { reading?: Record<string, number> }) =>
  ({
    chemicals: [over.reading ?? inRange],
    added: [],
    components: done,
    ...over,
  }) as VisitSummaryInput;

describe("a visit's one-line summary", () => {
  it("says balanced and clean when the water is in range and the checklist is done", () => {
    expect(visitSummary(visit({}))).toBe("Your pool is balanced and clean.");
  });

  it("says only balanced when the checklist isn't finished or there isn't one", () => {
    expect(visitSummary(visit({ components: [...done, { status: "pending" }] }))).toBe(
      "Your water is balanced.",
    );
    expect(visitSummary(visit({ components: [] }))).toBe("Your water is balanced.");
  });

  it("names a high reading and what was added to bring it down", () => {
    expect(
      visitSummary(
        visit({
          reading: { ...inRange, ph: 8.0 },
          added: [{ name: "Muriatic Acid 31%", reading_key: "ph" }],
        }),
      ),
    ).toBe("pH was high; we added muriatic acid to bring it down.");
  });

  it("brings a low reading up", () => {
    expect(
      visitSummary(
        visit({
          reading: { ...inRange, fc: 0.5 },
          added: [{ name: "Liquid chlorine", reading_key: "fc" }],
        }),
      ),
    ).toBe("Free chlorine was low; we added liquid chlorine to bring it up.");
  });

  it("says what needs attention when nothing was added for it", () => {
    expect(visitSummary(visit({ reading: { ...inRange, ch: 700 } }))).toBe(
      "Calcium was high and needs attention.",
    );
  });

  it("names several readings, and splits treated from untreated", () => {
    expect(
      visitSummary(
        visit({
          reading: { ...inRange, ph: 8.0, ta: 50 },
          added: [
            { name: "Muriatic acid", reading_key: "ph" },
            { name: "Baking soda", reading_key: "ta" },
          ],
        }),
      ),
    ).toBe(
      "pH was high and alkalinity was low; we added muriatic acid and baking soda to bring them back in range.",
    );
    expect(
      visitSummary(
        visit({
          reading: { ...inRange, ph: 8.0, ch: 700 },
          added: [{ name: "Muriatic acid", reading_key: "ph" }],
        }),
      ),
    ).toBe(
      "pH was high; we added muriatic acid to bring it down. Calcium was high and needs attention.",
    );
  });

  it("judges by the level the tech aimed for", () => {
    const goals = { ph: 7.2 };
    expect(
      visitSummary({ chemicals: [{ ...inRange, ph: 7.8, goals }], added: [], components: done }),
    ).toBe("pH was high and needs attention.");
  });

  it("has a plain line without a water test", () => {
    expect(visitSummary({ chemicals: [], added: [], components: done })).toBe(
      "Your pool was serviced.",
    );
    expect(visitSummary({ components: [] })).toBe("Your pool was serviced.");
  });
});

describe("who did the work", () => {
  it("prints a first name, never an email", () => {
    expect(techFirstName("Jake Miller")).toBe("Jake");
    expect(techFirstName("  maria  ")).toBe("maria");
    expect(techFirstName("jake@shop.test")).toBeNull();
    expect(techFirstName(null)).toBeNull();
    expect(techFirstName("")).toBeNull();
  });

  it("joins two techs and drops duplicates", () => {
    expect(techFirstNames(["Jake Miller", "Maria Cruz"])).toBe("Jake and Maria");
    expect(techFirstNames(["Jake Miller", "Jake Lee"])).toBe("Jake");
    expect(techFirstNames([null, "a@b.test"])).toBeNull();
  });

  it("says the verb for the job", () => {
    expect(reportByLine("maintenance", ["Jake Miller"])).toBe("Serviced by Jake");
    expect(reportByLine("detection", ["Jake Miller"])).toBe("Inspected by Jake");
    expect(reportByLine("repair", ["Jake Miller"])).toBe("Repaired by Jake");
    expect(reportByLine("maintenance", [null])).toBeNull();
  });
});

describe("the finished-pool photo", () => {
  const p = (id: string, at: string | null, over = {}) => ({
    id,
    kind: "photo",
    captured_at: at,
    ...over,
  });

  it("is the last photo of the pool as a whole", () => {
    const media = [
      p("a", "2026-10-26T14:00:00Z"),
      p("b", "2026-10-26T15:00:00Z"),
      p("c", "2026-10-26T16:00:00Z", { finding_id: "f1" }),
      { ...p("d", "2026-10-26T17:00:00Z"), kind: "video" },
    ];
    expect(reportHeroPhoto(media)?.id).toBe("b");
  });

  it("falls back to any photo, and skips ones the page can't draw", () => {
    const media = [p("a", null, { test_id: "t" }), p("b", null, { component_id: "c" })];
    expect(reportHeroPhoto(media)?.id).toBe("b");
    expect(reportHeroPhoto(media, (m) => m.id === "a")?.id).toBe("a");
    expect(reportHeroPhoto([])).toBeNull();
    expect(reportHeroPhoto([{ ...p("v", null), kind: "video" }])).toBeNull();
  });
});

describe("leak, inspection and repair reports", () => {
  it("names the leaks found", () => {
    const leaking: ReportSnapshot = {
      ...SNAPSHOT,
      components: SNAPSHOT.components.map((c) =>
        c.id === "r3" ? { ...c, outcome: "leaking" as const, location_text: "under the deck" } : c,
      ),
    };
    expect(leakSummary(leaking)).toBe("We found a leak: Return 3 (under the deck).");
    // Before verdicts were kept: the findings.
    expect(leakSummary(SNAPSHOT)).toBe("We found 2 issues to fix.");
  });

  it("says no leaks when nothing leaks", () => {
    const clean: ReportSnapshot = {
      ...SNAPSHOT,
      findings: [],
      components: SNAPSHOT.components.map((c) => ({ ...c, outcome: "ok" as const })),
    };
    expect(leakSummary(clean)).toMatch(/^We found no leaks/);
  });

  it("counts a repair as complete", () => {
    expect(leakSummary({ ...SNAPSHOT, job: { ...SNAPSHOT.job, type: "repair" } })).toBe(
      "Your repair is complete.",
    );
  });
});

describe("a month", () => {
  it("counts the tests in range", () => {
    const ok = { chemicals: [inRange] };
    const bad = { chemicals: [{ ...inRange, ph: 8.1 }] };
    expect(monthSummary([ok, ok, ok, ok])).toBe("Your water was balanced at every test (4).");
    expect(monthSummary([ok, bad, ok])).toBe("Your water was in range at 2 of 3 tests.");
    expect(monthSummary([{}, {}])).toBe("Your pool was serviced 2 times.");
    expect(monthSummary([{}])).toBe("Your pool was serviced.");
  });
});

describe("an invoice's one line", () => {
  const base = {
    status: "sent" as const,
    total_cents: 18000,
    balance_cents: 18000,
    due_date: null,
    sent_at: "2026-10-26T15:00:00Z",
  };
  it("says what is due and when", () => {
    expect(invoiceSummary(base)).toBe("$180.00 due on receipt.");
    expect(invoiceSummary({ ...base, due_date: "2026-10-26" })).toBe("$180.00 due on receipt.");
    expect(invoiceSummary({ ...base, due_date: "2026-11-05" })).toBe("$180.00 due November 5.");
  });
  it("thanks a paid invoice and names what is still due on a part-paid one", () => {
    expect(invoiceSummary({ ...base, status: "paid", balance_cents: 0 })).toBe(
      "Paid in full. Thank you!",
    );
    expect(invoiceSummary({ ...base, status: "partially_paid", balance_cents: 8000 })).toBe(
      "$80.00 still due.",
    );
  });
  it("says nothing on a canceled one", () => {
    expect(invoiceSummary({ ...base, status: "void" })).toBeNull();
  });
});
