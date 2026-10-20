import { describe, expect, it } from "vitest";
import {
  calculateChemistry,
  dryMeasure,
  fluidAmount,
  gallonMeasure,
  saturationIndex,
  targets,
  weightAmount,
  type ChemistryInput,
} from "../src";

const base: ChemistryInput = {
  gallons: 20_000,
  readings: {},
  chlorine: "liquid12",
  acid: "muriatic31",
};
const run = (readings: ChemistryInput["readings"], over: Partial<ChemistryInput> = {}) =>
  calculateChemistry({ ...base, ...over, readings });

describe("amounts in words", () => {
  it("reads like a tech would measure", () => {
    expect(fluidAmount(12.4)).toBe("12 fl oz");
    expect(fluidAmount(154)).toBe("1 gal 26 fl oz");
    expect(fluidAmount(256)).toBe("2 gal");
    expect(weightAmount(6)).toBe("6 oz");
    expect(weightAmount(56)).toBe("3.5 lb");
    expect(weightAmount(16 * 42.4)).toBe("42 lb");
  });

  it("and the way it's poured or weighed out on the deck", () => {
    expect(gallonMeasure(4)).toBe("A splash");
    expect(gallonMeasure(8)).toBe("1 cup");
    expect(gallonMeasure(20)).toBe("2½ cups");
    expect(gallonMeasure(64)).toBe("½ gallon");
    // Thirds under a gallon, so near-equal amounts read the same.
    expect(gallonMeasure(47)).toBe("⅓ gallon");
    expect(gallonMeasure(48)).toBe("⅓ gallon");
    expect(gallonMeasure(85)).toBe("⅔ gallon");
    expect(gallonMeasure(120)).toBe("1 gallon");
    expect(gallonMeasure(100)).toBe("¾ gallon");
    expect(gallonMeasure(150)).toBe("1¼ gallons");
    expect(gallonMeasure(128 * 5.3)).toBe("5½ gallons");
    expect(dryMeasure(3)).toBe("A scoop");
    expect(dryMeasure(12)).toBe("1 lb");
    expect(dryMeasure(16 * 3.3)).toBe("3½ lb");
    expect(dryMeasure(16 * 23.4)).toBe("23 lb");
    expect(dryMeasure(16 * 133, 40)).toBe("3½ bags");
  });
});

describe("doses", () => {
  it("balanced water needs nothing", () => {
    const r = run({ fc: 4, ph: 7.5, ta: 100, ch: 350, cya: 40 });
    expect(r.steps).toEqual([]);
    expect(r.statuses.every((s) => s.status === "ok")).toBe(true);
  });

  it("raises chlorine by the chart: 10.7 fl oz of 12.5% per ppm per 10,000 gal", () => {
    // Target with 40 stabilizer: minimum 3 ppm, aim 4. From 1: +3 ppm × 2 × 10.7 = 64 fl oz.
    const r = run({ fc: 1, cya: 40 });
    expect(r.steps).toEqual([
      expect.objectContaining({
        key: "fc",
        product: "Liquid chlorine 12.5%",
        amount: "64 fl oz",
        measure: "½ gallon",
        why: "Free chlorine 1 → 4",
      }),
    ]);
    const hypo = run({ fc: 1, cya: 40 }, { chlorine: "calhypo65" });
    expect(hypo.steps[0]).toMatchObject({ amount: "12 oz" });
  });

  it("lowers pH with acid, more when alkalinity is high", () => {
    // 8.0 → 7.5 is 2.5 × 0.2; 13 fl oz × 2.5 × 2 (20,000 gal) = 65 fl oz at 100 ppm TA.
    expect(run({ ph: 8.0, ta: 100 }).steps[0]).toMatchObject({
      key: "ph",
      amount: "65 fl oz",
      measure: "½ gallon",
    });
    expect(run({ ph: 8.0, ta: 110 }).steps[0]).toMatchObject({ amount: "72 fl oz" }); // more buffer
    expect(run({ ph: 7.0, ta: 100 }).steps[0]).toMatchObject({
      product: "Soda ash",
      amount: "1.9 lb",
    }); // 2.5 × 6 oz × 2
  });

  it("fixes alkalinity before pH", () => {
    const r = run({ ph: 7.0, ta: 60 });
    expect(r.steps.map((s) => s.key)).toEqual(["ta", "ph"]);
    // +40 ppm: 4 × 1.4 lb × 2 = 11.2 lb of baking soda.
    expect(r.steps[0]).toMatchObject({
      product: "Baking soda",
      amount: "11.2 lb",
      measure: "11 lb",
    });
  });

  it("calcium and stabilizer go up by product, down by draining", () => {
    // +150 ppm to 300: 15 × 1.2 lb × 2 = 36 lb.
    expect(run({ ch: 150 }).steps[0]).toMatchObject({
      product: "Calcium chloride 77%",
      amount: "36 lb",
    });
    expect(run({ cya: 120 }).steps[0]).toMatchObject({
      product: "Drain and refill about 70%",
      amount: null,
    });
    expect(run({ cya: 0 }).steps[0]).toMatchObject({ key: "cya", amount: "6.7 lb" });
  });

  it("one set of targets for every pool: salt is checked when it's read", () => {
    // A salt pool's usual stabilizer is fine, and a chlorine pool leaves salt blank.
    expect(run({ cya: 70 }).steps).toEqual([]);
    expect(run({ fc: 4, cya: 40 }).statuses.map((s) => s.key)).toEqual(["fc", "cya"]);
    const r = run({ salt: 2400, cya: 70 });
    // +800 ppm in 20,000 gal: 8 × 8.34 lb × 2 = 133 lb.
    expect(r.steps[0]).toMatchObject({
      product: "Pool salt",
      amount: "133 lb",
      measure: "3½ bags",
    });
  });

  it("free chlorine target follows stabilizer", () => {
    expect(targets(80).fc.low).toBe(6);
    expect(targets(0).fc.low).toBe(2);
  });
});

describe("saturation index", () => {
  it("balanced water is near zero", () => {
    const lsi = saturationIndex({ ph: 7.5, ta: 100, ch: 300, cya: 40 });
    expect(lsi).toBeGreaterThan(-0.3);
    expect(lsi).toBeLessThan(0.3);
    expect(run({ ph: 7.0, ta: 50, ch: 100 }).lsiLabel).toBe("Corrosive");
    expect(run({ ph: 8.2, ta: 150, ch: 600 }).lsiLabel).toBe("Scale forming");
    expect(saturationIndex({ ph: 7.5 })).toBeNull();
  });
});

describe("wording", () => {
  it("shows half-ppm chlorine targets", () => {
    // Stabilizer 30: minimum 2.5 ppm, aim 3.5.
    expect(run({ fc: 1, cya: 30 }).steps[0]).toMatchObject({ why: "Free chlorine 1 → 3.5" });
  });
});

describe("summary", () => {
  it("names the first step in everyday words, and how many more", async () => {
    const { doseSummary } = await import("../src");
    const r = run({ ph: 8.0, ta: 100, fc: 1, cya: 40 });
    expect(doseSummary(r, true)).toBe("½ gallon muriatic acid · 1 more");
    expect(doseSummary(run({ fc: 4, ph: 7.5 }), true)).toBe("Balanced. Nothing to add.");
    expect(doseSummary(r, false)).toBe("Add the gallons and a reading");
  });
});

describe("chosen levels", () => {
  it("doses chlorine up to the level the tech picks, not the recommended one", () => {
    const usual = run({ fc: 2, cya: 40 });
    expect(usual.steps.map((s) => s.key)).toEqual(["fc"]);
    expect(usual.steps[0]!.why).toBe("Free chlorine 2 → 4");
    const six = run({ fc: 2, cya: 40 }, { goals: { fc: 6 } });
    expect(six.steps[0]!.why).toBe("Free chlorine 2 → 6");
    expect(parseFloat(six.steps[0]!.amount!)).toBeGreaterThan(parseFloat(usual.steps[0]!.amount!));
  });

  it("adds nothing when a reading is already at the chosen level", () => {
    expect(run({ fc: 6 }, { goals: { fc: 6 } }).steps).toEqual([]);
    expect(run({ fc: 5.6 }, { goals: { fc: 6 } }).steps).toEqual([]);
  });

  it("brings pH down to a lower chosen level even inside the usual range", () => {
    const r = run({ ph: 7.5, ta: 100 }, { goals: { ph: 7.2 } });
    expect(r.steps.map((s) => s.key)).toEqual(["ph"]);
    expect(r.steps[0]!.why).toBe("pH 7.5 → 7.2");
  });

  it("ignores empty or negative levels", () => {
    expect(run({ fc: 2, cya: 40 }, { goals: { fc: null } }).steps[0]!.why).toBe(
      "Free chlorine 2 → 4",
    );
    expect(run({ fc: 2, cya: 40 }, { goals: { fc: -1 } }).steps[0]!.why).toBe(
      "Free chlorine 2 → 4",
    );
  });
});

describe("readingSummary", () => {
  it("lists the readings taken, in the calculator's order", async () => {
    const { readingSummary } = await import("../src/chemistry");
    expect(readingSummary({ ph: 7.6, fc: 3, salt: null, ta: 90 })).toBe("FC 3 · pH 7.6 · TA 90");
    expect(readingSummary({ ph: 7 })).toBe("pH 7.0");
    expect(readingSummary({})).toBe("");
  });
});

describe("a visit report's water test", () => {
  it("lists each reading taken with its range and how it measured", async () => {
    const { waterTestRows } = await import("../src");
    const rows = waterTestRows({ fc: 1, ph: 7.5, ta: 140, cya: null, salt: undefined });
    expect(rows.map((r) => [r.label, r.value, r.range, r.statusLabel])).toEqual([
      ["Free chlorine", 1, "3–6", "Low"],
      ["pH", 7.5, "7.4–7.6", "In range"],
      ["Alkalinity", 140, "80–120", "High"],
    ]);
    expect(waterTestRows({})).toEqual([]);
  });
});
