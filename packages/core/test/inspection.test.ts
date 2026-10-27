import { describe, expect, it } from "vitest";
import {
  currentVerdict,
  verdictOptions,
  verdictValues,
  bucketEvaporation,
  calculate,
  componentApplies,
  nextInstance,
  nextCustomItem,
  customItemName,
  customItemType,
  isCustomItemType,
  takesCustomItems,
  CUSTOM_ITEM_MAX,
  normalizeTestData,
  planComponents,
  previewTest,
  poolDiagram,
  pressureDrop,
  checklistTally,
  verdictLabel,
  validateFinding,
  validateTestData,
  type ComponentType,
  type JobComponent,
  type TestFieldSchema,
  removeItemConfirm,
  centerLayout,
  shownDiagram,
  offsetPath,
  parseDiagramLayout,
} from "../src";

const type = (key: string, over: Partial<ComponentType> = {}): ComponentType => ({
  id: key,
  company_id: "c",
  key,
  name: key[0]!.toUpperCase() + key.slice(1),
  allows_multiple: false,
  default_count: 1,
  applies_to: "pool",
  methods: ["Visual"],
  sort_order: 10,
  active: true,
  ...over,
});

const types = [
  type("skimmer", { allows_multiple: true, default_count: 2, sort_order: 10 }),
  type("return", { allows_multiple: true, default_count: 4, sort_order: 20 }),
  type("spa", { applies_to: "spa", sort_order: 70 }),
  type("light", { allows_multiple: true, default_count: 1, applies_to: "both", sort_order: 40 }),
  type("retired", { active: false }),
];

describe("checklist", () => {
  it("plans default instances, skipping the spa when there is none", () => {
    const labels = planComponents(types, { has_pool: true, has_spa: false }).map((c) => c.label);
    expect(labels).toEqual([
      "Skimmer 1",
      "Skimmer 2",
      "Return 1",
      "Return 2",
      "Return 3",
      "Return 4",
      "Light",
    ]);
  });

  it("leaves items done on a schedule off new visits", () => {
    const visit = [
      type("skim", { job_type: "maintenance" }),
      type("filter_clean", { job_type: "maintenance", on_schedule: true }),
    ];
    expect(
      planComponents(visit, { has_pool: true, has_spa: false }, "maintenance").map((c) => c.label),
    ).toEqual(["Skim"]);
  });

  it("includes the spa when the property has one", () => {
    expect(planComponents(types, { has_pool: true, has_spa: true }).map((c) => c.label)).toContain(
      "Spa",
    );
    expect(componentApplies({ applies_to: "spa" }, { has_pool: true, has_spa: false })).toBe(false);
  });

  it("numbers added instances after the highest existing one", () => {
    const existing = [3, 1, 4].map((n): JobComponent => ({
      id: `r${n}`,
      company_id: "c",
      job_id: "j",
      component_type_id: "return",
      instance_number: n,
      label: `Return ${n}`,
      sort_order: 0,
    }));
    expect(nextInstance(types[1]!, existing)).toMatchObject({
      instance_number: 5,
      label: "Return 5",
    });
  });

  it("counts verdicts for the report tiles and labels them in the shop's words", () => {
    const comp = (id: string): JobComponent => ({
      id,
      company_id: "c",
      job_id: "j",
      component_type_id: "t",
      instance_number: 1,
      label: id,
      sort_order: 0,
    });
    const result = (id: string, over: object) => ({
      id: `r-${id}`,
      company_id: "c",
      job_id: "j",
      job_component_id: id,
      ...over,
    });
    const tally = checklistTally(["a", "b", "c", "d", "e"].map(comp), [
      result("a", { status: "inspected", outcome: "ok" }),
      result("b", { status: "inspected", outcome: "leaking" }),
      result("c", { status: "inspected", outcome: "attention" }),
      result("d", { status: "excluded" }),
    ] as never);
    expect(tally).toEqual({ pass: 1, attention: 1, leaking: 1, notApplicable: 1, pending: 1 });
    expect(verdictLabel({ status: "inspected", outcome: "ok" })).toBe("Not leaking");
    expect(verdictLabel({ status: "excluded" })).toBe("Not applicable");
    expect(verdictLabel({ status: "inspected", outcome: "ok" }, "yes_no")).toBe("No");
    expect(verdictLabel({ status: "inspected", outcome: "attention" }, "yes_no")).toBe("Yes");
  });

  it("skips vinyl checks on pools known to be another type", () => {
    const vinyl = { applies_to: "pool" as const, applies_to_pool_type: "vinyl" };
    expect(
      componentApplies(vinyl, { has_pool: true, has_spa: false, pool_type: "gunite_plaster" }),
    ).toBe(false);
    expect(componentApplies(vinyl, { has_pool: true, has_spa: false, pool_type: "vinyl" })).toBe(
      true,
    );
    expect(componentApplies(vinyl, { has_pool: true, has_spa: false, pool_type: null })).toBe(true);
  });
});

describe("pressure test", () => {
  it("held line passes", () => {
    expect(pressureDrop({ start_psi: 20, end_psi: 20, duration_min: 15 })).toMatchObject({
      suggested: "pass",
      summary: "Held at 20 PSI in 15 min",
      computed: { drop_psi: 0, drop_psi_per_min: 0 },
    });
  });

  it("drop fails", () => {
    expect(pressureDrop({ start_psi: "20", end_psi: "12", duration_min: "15" })).toMatchObject({
      suggested: "fail",
      summary: "Dropped 8 PSI in 15 min",
      computed: { drop_psi: 8, drop_psi_per_min: 0.533 },
    });
  });

  it("respects the configured tolerance and minimum duration", () => {
    expect(
      pressureDrop({ start_psi: 20, end_psi: 19.5, duration_min: 15 }, { pass_max_drop_psi: 0.5 })
        .suggested,
    ).toBe("pass");
    expect(
      pressureDrop({ start_psi: 20, end_psi: 19.4, duration_min: 15 }, { pass_max_drop_psi: 0.5 })
        .suggested,
    ).toBe("fail");
    expect(
      pressureDrop({ start_psi: 20, end_psi: 20, duration_min: 5 }, { min_duration_min: 15 })
        .suggested,
    ).toBe("inconclusive");
  });

  it("rising pressure is inconclusive, not a pass", () => {
    expect(pressureDrop({ start_psi: 20, end_psi: 21, duration_min: 15 })).toMatchObject({
      suggested: "inconclusive",
      summary: "Rose 1 PSI in 15 min",
    });
  });

  it("waits for both readings", () => {
    expect(pressureDrop({ start_psi: 20, end_psi: "" })).toEqual({
      computed: {},
      suggested: null,
      summary: null,
    });
  });

  it("avoids floating-point noise", () => {
    expect(pressureDrop({ start_psi: 20.3, end_psi: 20.1 }).computed.drop_psi).toBe(0.2);
  });
});

describe("bucket test", () => {
  const base = { pool_start_in: 10, bucket_start_in: 10, duration_hours: 24 };

  it("loss matching evaporation passes", () => {
    expect(bucketEvaporation({ ...base, pool_end_in: 9.75, bucket_end_in: 9.75 })).toMatchObject({
      suggested: "pass",
      computed: { unexplained_loss_in: 0, unexplained_in_per_day: 0 },
      summary: "No loss beyond evaporation over 24 h",
    });
  });

  it("extra pool loss fails", () => {
    expect(bucketEvaporation({ ...base, pool_end_in: 9.25, bucket_end_in: 9.94 })).toMatchObject({
      suggested: "fail",
      computed: {
        pool_loss_in: 0.75,
        bucket_loss_in: 0.06,
        unexplained_loss_in: 0.69,
        unexplained_in_per_day: 0.69,
      },
    });
  });

  it("scales to a per-day rate and uses the configured threshold", () => {
    const r = bucketEvaporation(
      { ...base, duration_hours: 12, pool_end_in: 9.9, bucket_end_in: 9.95 },
      { fail_over_in_per_day: 0.125 },
    );
    expect(r.computed.unexplained_in_per_day).toBe(0.1);
    expect(r.suggested).toBe("pass");
  });

  it("needs all readings and a positive duration", () => {
    expect(
      bucketEvaporation({ ...base, pool_end_in: 9, bucket_end_in: 9, duration_hours: 0 }).suggested,
    ).toBeNull();
  });
});

describe("test forms", () => {
  const schema: TestFieldSchema = {
    fields: [
      { key: "line_name", label: "Line", type: "text", required: true },
      { key: "start_psi", label: "Start pressure", type: "number", unit: "PSI", required: true },
      { key: "observation", label: "Result", type: "select", options: ["No draw", "Leak"] },
    ],
  };

  it("validates required fields, numbers, and options", () => {
    expect(
      validateTestData(schema, { line_name: "", start_psi: "abc", observation: "Maybe" }),
    ).toEqual({
      line_name: "Enter line.",
      start_psi: "Enter a number.",
      observation: "Pick one of the options.",
    });
    expect(validateTestData(schema, { line_name: "Return 1", start_psi: "20" })).toEqual({});
  });

  it("normalizes values for storage", () => {
    expect(
      normalizeTestData(schema, { line_name: " Return 1 ", start_psi: "20.5", observation: "" }),
    ).toEqual({
      line_name: "Return 1",
      start_psi: 20.5,
      observation: null,
    });
  });

  it("runs the type's calculator with its options", () => {
    const t = {
      calculator: "pressure_drop" as const,
      field_schema: { fields: [], options: { pass_max_drop_psi: 1 } },
    };
    expect(calculate(t, { start_psi: 20, end_psi: 19 }).suggested).toBe("pass");
    expect(calculate({ calculator: null, field_schema: { fields: [] } }, {}).suggested).toBeNull();
  });

  describe("reading bounds (owner, 2026-10-20)", () => {
    const pressure = {
      calculator: "pressure_drop" as const,
      field_schema: {
        fields: [
          {
            key: "start_psi",
            label: "Start pressure",
            type: "number" as const,
            unit: "PSI",
            required: true,
            min: 0,
            max: 150,
          },
          {
            key: "end_psi",
            label: "End pressure",
            type: "number" as const,
            unit: "PSI",
            required: true,
            min: 0,
            max: 150,
          },
          {
            key: "duration_min",
            label: "Duration",
            type: "number" as const,
            unit: "min",
            min: 0,
            max: 1440,
          },
        ],
      },
    };

    it("refuses readings outside a field's bounds", () => {
      expect(
        validateTestData(pressure.field_schema, {
          start_psi: "1e23",
          end_psi: "-2",
          duration_min: 1441,
        }),
      ).toEqual({
        start_psi: "Enter start pressure between 0 and 150 PSI.",
        end_psi: "Enter end pressure between 0 and 150 PSI.",
        duration_min: "Enter duration between 0 and 1440 min.",
      });
      expect(
        validateTestData(pressure.field_schema, {
          start_psi: 150,
          end_psi: "0",
          duration_min: "1440",
        }),
      ).toEqual({});
    });

    it("words a one-sided bound, and keeps the old rule without bounds", () => {
      const f = (extra: object) => ({
        fields: [{ key: "x", label: "Flow", type: "number" as const, ...extra }],
      });
      expect(validateTestData(f({ unit: "gal", min: 5 }), { x: 4 })).toEqual({
        x: "Enter flow of 5 gal or more.",
      });
      expect(validateTestData(f({ max: 2.5 }), { x: 3 })).toEqual({
        x: "Enter flow of 2.5 or less.",
      });
      expect(validateTestData(f({ min: -10 }), { x: -3 })).toEqual({});
      expect(validateTestData(f({}), { x: -3 })).toEqual({ x: "Can't be negative." });
      expect(validateTestData(f({}), { x: 1e23 })).toEqual({});
      expect(validateTestData(f({ min: "0", max: null }), { x: -1 })).toEqual({
        x: "Can't be negative.",
      });
    });

    it("keeps an impossible reading out of the live summary", () => {
      expect(previewTest(pressure, { start_psi: "1e23", end_psi: "0" }).summary).toBeNull();
      expect(
        previewTest(pressure, { start_psi: "20", end_psi: "12", duration_min: "15" }).summary,
      ).toBe("Dropped 8 PSI in 15 min");
      expect(
        previewTest(pressure, { start_psi: "20", end_psi: "12", duration_min: "9999" }).summary,
      ).toBe("Dropped 8 PSI");
    });
  });
});

describe("findings and diagram", () => {
  it("needs a title and severity", () => {
    expect(Object.keys(validateFinding({ title: " ", severity_key: "" })).sort()).toEqual([
      "severity_key",
      "title",
    ]);
  });

  it("draws every shape and adds the spa only when present", () => {
    for (const s of ["rectangle", "oval", "kidney", "l_shape", "freeform"] as const) {
      expect(poolDiagram(s, false).pool).toMatch(/^M.*Z$/);
    }
    expect(poolDiagram("kidney", true).spa).not.toBeNull();
    expect(poolDiagram(null, false)).toMatchObject({ width: 160, height: 100, spa: null });
  });

  it("draws the new shapes, mirrors, and puts the spa where it was placed (owner, 2026-10-19)", async () => {
    const { DIAGRAM_SHAPES, mirrorPath, parseDiagramLayout } = await import("../src/inspection");
    for (const s of DIAGRAM_SHAPES) expect(poolDiagram(s.key, false).pool).toMatch(/^M.*Z$/);
    expect(mirrorPath("M10 18 H124 V76 Q130 82 124 82 Z")).toBe(
      "M 130 18 H 16 V 76 Q 10 82 16 82 Z",
    );
    expect(poolDiagram("rectangle", true, { mirror: true }).spa).toMatchObject({ cx: 15, cy: 22 });
    const placed = poolDiagram("oval", true, {
      spa: { x: 0.5, y: 0.5, size: "large", shape: "square" },
    }).spa;
    expect(placed).toEqual({ cx: 80, cy: 50, r: 17, square: true });
    expect(parseDiagramLayout({ mirror: "yes", spa: { x: 2, y: 0.5 } })).toEqual({});
    expect(parseDiagramLayout({ spa: { x: 0.1, y: 0.2, size: "huge" } })).toEqual({
      spa: { x: 0.1, y: 0.2 },
    });
  });
});

describe("verdicts", () => {
  const now = new Date("2026-10-13T16:00:00Z");

  it("offers four verdicts, or three for yes/no items", () => {
    expect(verdictOptions({ answer: "leak" }).map((o) => o.label)).toEqual([
      "Not Leaking",
      "Leaking",
      "Attention",
      "N/A",
    ]);
    expect(verdictOptions({ answer: "yes_no" }).map((o) => o.label)).toEqual(["No", "Yes", "N/A"]);
  });

  it("reads the verdict back from the row", () => {
    expect(currentVerdict(undefined)).toBeNull();
    expect(currentVerdict({ status: "pending" })).toBeNull();
    expect(currentVerdict({ status: "excluded" })).toBe("na");
    expect(currentVerdict({ status: "inspected", outcome: null })).toBe("ok");
    expect(currentVerdict({ status: "inspected", outcome: "leaking" })).toBe("leaking");
  });

  it("keeps where only for leaking and attention", () => {
    expect(verdictValues("leaking", "u1", now)).toEqual({
      status: "inspected",
      outcome: "leaking",
      inspected_at: now.toISOString(),
      inspected_by: "u1",
    });
    expect(verdictValues("ok", "u1", now).location_text).toBeNull();
    expect(verdictValues("na", "u1", now)).toMatchObject({
      status: "excluded",
      outcome: null,
      location_text: null,
    });
    expect(verdictValues(null, "u1", now)).toMatchObject({ status: "pending", inspected_at: null });
  });
});

describe("removeItemConfirm", () => {
  it("asks before removing, and says a scheduled cleaning stays due", () => {
    expect(removeItemConfirm("Skimmer 2", false)).toEqual({
      title: "Remove Skimmer 2 from the checklist?",
      message: null,
      confirm: "Remove Item",
    });
    expect(removeItemConfirm("Clean filter", true).message).toBe(
      "It’s still due, so it goes on the next visit.",
    );
  });
});

describe("pool diagram: draw, landmarks, the spa's size, clear", async () => {
  const core = await import("../src");
  it("has seven preset tiles: Freeform left for Draw, and still draws", () => {
    expect(core.DIAGRAM_SHAPES.map((s) => s.key)).toEqual([
      "rectangle",
      "oval",
      "kidney",
      "l_shape",
      "roman",
      "grecian",
      "figure_eight",
    ]);
    expect(core.poolDiagram("freeform", false).pool).toMatch(/^M24 22/);
    expect(core.poolDiagram("custom", false).pool).toBe("");
    expect(core.poolDiagram("custom", false, { mirror: true }).pool).toBe("");
  });

  it("reads drawn shapes and landmarks, and drops anything else", () => {
    const layout = core.parseDiagramLayout({
      drawing: [
        { type: "line", x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.2 },
        { type: "circle", cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.2 },
        {
          type: "pen",
          points: [
            [0, 0],
            [0.5, 0.5],
            [2, 2],
          ],
        },
        { type: "pen", points: [[0.1, 0.1]] },
        { type: "square", x: 0.1 },
      ],
      landmarks: [
        { kind: "tree", x: 0.05, y: 0.9, extra: 1 },
        { kind: "boat", x: 0.5, y: 0.5 },
        { kind: "rock", x: 1.5, y: 0.5 },
      ],
      spa: { x: 0.8, y: 0.2, r: 20, shape: "square" },
    });
    expect(layout.drawing).toEqual([
      { type: "line", x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.2 },
      { type: "circle", cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.2 },
      {
        type: "pen",
        points: [
          [0, 0],
          [0.5, 0.5],
        ],
      },
    ]);
    expect(layout.landmarks).toEqual([{ kind: "tree", x: 0.05, y: 0.9 }]);
    // The pool fittings (owner, 2026-10-26) are read, turned ones keep their turn, and the
    // round ones keep a mirror.
    expect(
      core.parseDiagramLayout({
        landmarks: [
          { kind: "skimmer", x: 0.5, y: 0.1, turn: 2 },
          { kind: "mainDrain", x: 0.5, y: 0.5, flip: true, turn: 1 },
          { kind: "light", x: 0.2, y: 0.5 },
          { kind: "poolReturn", x: 0.1, y: 0.5, turn: 3 },
          { kind: "suctionLine", x: 0.9, y: 0.5, flip: true },
        ],
      }).landmarks,
    ).toEqual([
      { kind: "skimmer", x: 0.5, y: 0.1, turn: 2 },
      { kind: "mainDrain", x: 0.5, y: 0.5, flip: true },
      { kind: "light", x: 0.2, y: 0.5 },
      { kind: "poolReturn", x: 0.1, y: 0.5, turn: 3 },
      { kind: "suctionLine", x: 0.9, y: 0.5 },
    ]);
    expect(layout.spa).toEqual({ x: 0.8, y: 0.2, r: 20, shape: "square" });
    expect(core.parseDiagramLayout({ spa: { x: 0.5, y: 0.5, r: 99 } }).spa).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it("draws them: shapes as paths, landmarks in a 14-unit box kept inside", () => {
    const d = core.poolDiagram("custom", true, {
      spa: { x: 0.5, y: 0.5, r: 20 },
      drawing: [
        { type: "line", x1: 0, y1: 0, x2: 1, y2: 1 },
        { type: "circle", cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.1 },
      ],
      landmarks: [{ kind: "house", x: 0, y: 1 }],
    });
    expect(d.spa).toEqual({ cx: 80, cy: 50, r: 20, square: false });
    expect(d.drawing[0]).toBe("M0 0 L160 100");
    expect(d.drawing[1]).toBe(
      "M80 40 C102.1 40 120 44.5 120 50 C120 55.5 102.1 60 80 60 C57.9 60 40 55.5 40 50 C40 44.5 57.9 40 80 40 Z",
    );
    expect(d.landmarks).toEqual([
      {
        kind: "house",
        cx: 10,
        cy: 90,
        size: 20,
        flip: false,
        mirror: "x",
        turn: 0,
        parts: core.LANDMARKS.find((l) => l.key === "house")!.parts,
      },
    ]);
  });

  it("landmark paths use only the commands every platform reads", () => {
    for (const l of core.LANDMARKS)
      for (const p of l.parts) expect(p.d, l.key).toMatch(/^[MLHVQCZ0-9. -]+$/);
    expect(core.LANDMARKS.map((l) => l.label)).toEqual([
      "Tree",
      "Rock",
      "Waterfall",
      "Steps",
      "Equipment",
      "House",
      "Skimmer",
      "Main Drain",
      "Light",
      "Return",
      "Suction Line",
    ]);
  });

  it("turns a drag into a line, circle, or stroke", () => {
    const drag = [
      { x: 0.1, y: 0.1 },
      { x: 0.3, y: 0.2 },
      { x: 0.5, y: 0.5 },
    ];
    expect(core.drawnShapeFrom("line", drag)).toEqual({
      type: "line",
      x1: 0.1,
      y1: 0.1,
      x2: 0.5,
      y2: 0.5,
    });
    expect(core.drawnShapeFrom("circle", drag)).toEqual({
      type: "circle",
      cx: 0.3,
      cy: 0.3,
      rx: 0.2,
      ry: 0.2,
    });
    expect(core.drawnShapeFrom("pen", drag)).toEqual({
      type: "pen",
      points: [
        [0.1, 0.1],
        [0.3, 0.2],
        [0.5, 0.5],
      ],
    });
    expect(
      core.drawnShapeFrom("line", [
        { x: 0.1, y: 0.1 },
        { x: 0.105, y: 0.1 },
      ]),
    ).toBeNull();
    expect(core.drawnShapeFrom("pen", [{ x: 2, y: -1 }])).toBeNull();
  });

  it("sizes a pinched spa, and names its nearest preset", () => {
    expect(core.clampSpaR(3)).toBe(7);
    expect(core.clampSpaR(40)).toBe(28);
    expect(core.clampSpaR(12.345)).toBe(12.3);
    expect(core.spaSizeFor(7)).toBe("small");
    expect(core.spaSizeFor(14)).toBe("medium");
    expect(core.spaSizeFor(25)).toBe("large");
    expect(core.CLEARED_DIAGRAM).toEqual({ shape: "custom", hasSpa: false, layout: {} });
  });
});

describe("isDiagramShape", () => {
  it("takes the tiles, Freeform, and a drawn pool", async () => {
    const { isDiagramShape } = await import("../src");
    for (const k of ["rectangle", "figure_eight", "freeform", "custom"])
      expect(isDiagramShape(k)).toBe(true);
    for (const k of ["hexagon", "", null, 3]) expect(isDiagramShape(k)).toBe(false);
  });
});

describe("drawn lines snap straight", () => {
  it("locks a nearly level or plumb line, leaves a slanted one", async () => {
    const { drawnShapeFrom } = await import("../src");
    // 160 x 100: 0.5 across is 80 units; 0.05 down is 5 units, about 3.6 degrees.
    expect(
      drawnShapeFrom("line", [
        { x: 0.1, y: 0.5 },
        { x: 0.6, y: 0.55 },
      ]),
    ).toEqual({
      type: "line",
      x1: 0.1,
      y1: 0.5,
      x2: 0.6,
      y2: 0.5,
    });
    expect(
      drawnShapeFrom("line", [
        { x: 0.5, y: 0.1 },
        { x: 0.51, y: 0.9 },
      ]),
    ).toEqual({
      type: "line",
      x1: 0.5,
      y1: 0.1,
      x2: 0.5,
      y2: 0.9,
    });
    // 0.2 down is 20 units over 80: about 14 degrees, kept as drawn.
    expect(
      drawnShapeFrom("line", [
        { x: 0.1, y: 0.5 },
        { x: 0.6, y: 0.7 },
      ]),
    ).toEqual({
      type: "line",
      x1: 0.1,
      y1: 0.5,
      x2: 0.6,
      y2: 0.7,
    });
  });
});

describe("landmarks resize and flip", () => {
  it("keeps a size within bounds and a flip, and draws them", async () => {
    const core = await import("../src");
    const layout = core.parseDiagramLayout({
      landmarks: [
        { kind: "tree", x: 0.5, y: 0.5, s: 30, flip: true },
        { kind: "rock", x: 0.5, y: 0.5, s: 99, flip: "yes" },
      ],
    });
    expect(layout.landmarks).toEqual([
      { kind: "tree", x: 0.5, y: 0.5, s: 30, flip: true },
      { kind: "rock", x: 0.5, y: 0.5 },
    ]);
    const d = core.poolDiagram("rectangle", false, layout);
    expect(d.landmarks.map((l) => [l.size, l.flip])).toEqual([
      [30, true],
      [20, false],
    ]);
    // The steps are the same both ways across, so they mirror top to bottom (owner, 2026-10-20).
    expect(core.LANDMARKS.filter((l) => l.mirror === "y").map((l) => l.key)).toEqual(["steps"]);
    const steps = core.poolDiagram("rectangle", false, {
      landmarks: [{ kind: "steps", x: 0.5, y: 0.5, flip: true }],
    });
    expect(steps.landmarks[0]!.mirror).toBe("y");
    expect(core.clampLandmarkSize(3)).toBe(10);
    expect(core.clampLandmarkSize(60)).toBe(44);
    expect(core.clampLandmarkSize(22.26)).toBe(22.3);
  });
});

describe("centered pools (owner, 2026-10-20)", () => {
  it("draws a centered pool in the middle of the diagram, mirrored or not", () => {
    // Mirrored, the centered pool still sits in the middle: the L-shape's arm swaps sides.
    expect(poolDiagram("l_shape", false, { centered: true, mirror: true }).pool).toBe(
      "M 136 14 H 76 Q 70 14 70 20 V 48 H 26 Q 20 48 20 54 V 80 Q 20 86 26 86 H 136 Q 142 86 142 80 V 20 Q 142 14 136 14 Z",
    );
    expect(poolDiagram("rectangle", false).pool).toBe(
      "M16 18 H124 Q130 18 130 24 V76 Q130 82 124 82 H16 Q10 82 10 76 V24 Q10 18 16 18 Z",
    );
    expect(poolDiagram("rectangle", false, { centered: true }).pool).toBe(
      "M 26 18 H 134 Q 140 18 140 24 V 76 Q 140 82 134 82 H 26 Q 20 82 20 76 V 24 Q 20 18 26 18 Z",
    );
    expect(offsetPath("", 10)).toBe("");
  });

  it("moves what's placed along when a pool is centered, once", () => {
    const layout = centerLayout({
      mirror: true,
      spa: { x: 0.5, y: 0.2, r: 13 },
      landmarks: [{ kind: "tree", x: 0.98, y: 0.5 }],
      drawing: [
        { type: "line", x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.3 },
        { type: "circle", cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1 },
        {
          type: "pen",
          points: [
            [0.1, 0.4],
            [0.2, 0.5],
          ],
        },
      ],
    });
    expect(layout).toEqual({
      mirror: true,
      centered: true,
      spa: { x: 0.5625, y: 0.2, r: 13 },
      landmarks: [{ kind: "tree", x: 1, y: 0.5 }],
      drawing: [
        { type: "line", x1: 0.1625, y1: 0.1, x2: 0.2625, y2: 0.3 },
        { type: "circle", cx: 0.5625, cy: 0.5, rx: 0.1, ry: 0.1 },
        {
          type: "pen",
          points: [
            [0.1625, 0.4],
            [0.2625, 0.5],
          ],
        },
      ],
    });
    expect(centerLayout(layout)).toBe(layout);
    expect(parseDiagramLayout({ centered: true, mirror: "yes" })).toEqual({ centered: true });
  });

  it("draws the same diagram on Findings, the reports and the shape editor (owner, 2026-10-27)", () => {
    const saved = {
      spa: { x: 0.8, y: 0.2, r: 13 },
      landmarks: [{ kind: "tree", x: 0.1, y: 0.5 }],
      drawing: [{ type: "line", x1: 0.2, y1: 0.2, x2: 0.4, y2: 0.4 }],
    };
    // What the editor shows when it opens that layout, and what every other screen draws.
    const editor = poolDiagram("kidney", true, centerLayout(parseDiagramLayout(saved)));
    const shown = shownDiagram("kidney", true, saved);
    expect(shown).toEqual(editor);
    expect(shown.landmarks).toHaveLength(1);
    expect(shown.drawing).toHaveLength(1);
    expect(shown.spa?.cx).toBeCloseTo(0.8625 * 160);
    // Centered already: nothing moves a second time.
    expect(shownDiagram("kidney", true, { ...saved, centered: true }).landmarks[0]!.cx).toBeCloseTo(
      16,
    );
    expect(shownDiagram(null, false, null).pool).toBe(
      poolDiagram("rectangle", false, { centered: true }).pool,
    );
  });
});

describe("the steps turn on tap (owner, 2026-10-21)", () => {
  it("turns the steps a quarter clockwise each tap, and mirrors the others", async () => {
    const { tapLandmark, landmarkTurn, poolDiagram } = await import("../src");
    let steps: Parameters<typeof tapLandmark>[0] = { kind: "steps", x: 0.5, y: 0.5 };
    const turns: number[] = [];
    for (let i = 0; i < 5; i++) {
      steps = tapLandmark(steps);
      turns.push(landmarkTurn(steps));
    }
    expect(turns).toEqual([1, 2, 3, 0, 1]);
    expect("flip" in tapLandmark({ kind: "steps", x: 0.5, y: 0.5 })).toBe(false);
    // Steps saved flipped (before turning) count as turned twice, and tap on to three.
    expect(landmarkTurn({ kind: "steps", flip: true })).toBe(2);
    expect(tapLandmark({ kind: "steps", x: 0.5, y: 0.5, flip: true })).toEqual({
      kind: "steps",
      x: 0.5,
      y: 0.5,
      turn: 3,
    });
    // The waterfall turns too; saved mirrored, it's the same drawing, so it starts unturned.
    expect(landmarkTurn(tapLandmark({ kind: "waterfall", x: 0.5, y: 0.5 }))).toBe(1);
    expect(landmarkTurn({ kind: "waterfall", flip: true })).toBe(0);
    // The skimmer, return, and suction line turn (owner, 2026-10-26); the main drain and the
    // light are round, so they mirror.
    for (const kind of ["skimmer", "poolReturn", "suctionLine"] as const) {
      const once = tapLandmark({ kind, x: 0.5, y: 0.5 });
      expect([landmarkTurn(once), once.flip]).toEqual([1, undefined]);
    }
    for (const kind of ["mainDrain", "light"] as const) {
      const once = tapLandmark({ kind, x: 0.5, y: 0.5 });
      expect([landmarkTurn(once), once.flip]).toEqual([0, true]);
    }
    // A tree still mirrors.
    const tree = tapLandmark({ kind: "tree", x: 0.5, y: 0.5 });
    expect(tree.flip).toBe(true);
    expect(tapLandmark(tree).flip).toBeUndefined();
    const d = poolDiagram("oval", false, {
      landmarks: [{ kind: "steps", x: 0.5, y: 0.5, turn: 1 }],
    });
    expect([d.landmarks[0]!.turn, d.landmarks[0]!.flip]).toEqual([1, false]);
  });
});

describe("items typed in on a job", () => {
  const stand = type("custom_leak", {
    allows_multiple: true,
    default_count: 0,
    active: false,
    sort_order: 9000,
  });
  it("tidies the name and refuses a blank one", () => {
    expect(customItemName("  Cracked   deck\n drain ")).toBe("Cracked deck drain");
    expect(customItemName("   ")).toBeNull();
    expect(customItemName("x".repeat(CUSTOM_ITEM_MAX + 20))).toHaveLength(CUSTOM_ITEM_MAX);
  });
  it("finds the stand-in type for each checklist and hides it as a type", () => {
    const visit = type("custom_visit", { job_type: "maintenance" });
    expect(customItemType([type("pool"), stand, visit], "detection")).toBe(stand);
    expect(customItemType([stand, visit], "maintenance")).toBe(visit);
    expect(customItemType([type("pool")], "detection")).toBeUndefined();
    expect(isCustomItemType(stand)).toBe(true);
    expect(isCustomItemType(type("skimmer"))).toBe(false);
  });
  it("is offered on leak and visit checklists, not an inspection or a repair", () => {
    expect(takesCustomItems("detection")).toBe(true);
    expect(takesCustomItems("maintenance")).toBe(true);
    expect(takesCustomItems("inspection")).toBe(false);
    expect(takesCustomItems("repair")).toBe(false);
  });
  it("adds each typed item after the last, labelled with its name", () => {
    const one = nextCustomItem(stand, [], "Cracked deck drain");
    expect(one).toMatchObject({
      component_type_id: "custom_leak",
      instance_number: 1,
      label: "Cracked deck drain",
    });
    const existing = [
      { ...one!, id: "a", company_id: "c", job_id: "j" } as unknown as JobComponent,
    ];
    const two = nextCustomItem(stand, existing, "Dead frog in skimmer");
    expect(two).toMatchObject({ instance_number: 2, label: "Dead frog in skimmer" });
    expect(two!.sort_order).toBeGreaterThan(one!.sort_order);
    expect(nextCustomItem(stand, [], "  ")).toBeNull();
  });
});
