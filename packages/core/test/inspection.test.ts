import { describe, expect, it } from "vitest";
import {
  bucketEvaporation,
  calculate,
  checklistProgress,
  componentApplies,
  nextInstance,
  normalizeTestData,
  planComponents,
  poolDiagram,
  pressureDrop,
  validateChecklistResult,
  validateFinding,
  validateTestData,
  type ComponentType,
  type JobComponent,
  type TestFieldSchema,
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
      "Light 1",
    ]);
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

  it("counts progress, treating missing results as pending", () => {
    const comps = ["a", "b", "c"].map((id): JobComponent => ({
      id,
      company_id: "c",
      job_id: "j",
      component_type_id: "t",
      instance_number: 1,
      label: id,
      sort_order: 0,
    }));
    const results = [
      {
        id: "1",
        company_id: "c",
        job_id: "j",
        job_component_id: "a",
        status: "inspected" as const,
        method: "Visual",
      },
      {
        id: "2",
        company_id: "c",
        job_id: "j",
        job_component_id: "b",
        status: "excluded" as const,
        exclusion_reason: "No diver",
      },
    ];
    expect(checklistProgress(comps, results)).toEqual({
      total: 3,
      inspected: 1,
      excluded: 1,
      pending: 1,
    });
  });

  it("requires a method or a reason", () => {
    expect(validateChecklistResult({ status: "inspected" })).toMatch(/how/);
    expect(validateChecklistResult({ status: "excluded", exclusion_reason: "  " })).toMatch(
      /reason/,
    );
    expect(
      validateChecklistResult({ status: "excluded", exclusion_reason: "No diver on site" }),
    ).toBeNull();
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
});
