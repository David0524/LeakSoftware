import { describe, expect, it } from "vitest";
import {
  calculateChemistry,
  dryMeasure,
  fluidAmount,
  gallonMeasure,
  poolGallons,
  saturationIndex,
  targets,
  weightAmount,
  type ChemistryInput,
} from "../src";

const base: ChemistryInput = {
  gallons: 20_000,
  surface: "plaster",
  sanitizer: "chlorine",
  readings: {},
  chlorine: "liquid12",
  acid: "muriatic31",
};
const run = (readings: ChemistryInput["readings"], over: Partial<ChemistryInput> = {}) =>
  calculateChemistry({ ...base, ...over, readings });

describe("pool volume", () => {
  it("uses length × width × average depth × 7.48", () => {
    // 32 × 16 × 5.5 ft average = 2,816 cu ft = 21,064 gal, rounded to the hundred.
    expect(poolGallons("rectangle", 32, 16, 3.5, 7.5)).toBe(21_100);
    expect(poolGallons("round", 24, 0, 4, 4)).toBe(13_500);
    expect(poolGallons("kidney", 30, 15, 3.5, 6)).toBe(13_600);
    expect(poolGallons("rectangle", 0, 16, 3, 6)).toBe(0);
  });
});

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
    expect(run({ ch: 150 }).steps[0]).toMatchObject({
      product: "Calcium chloride 77%",
      amount: "48 lb",
    });
    expect(run({ ch: 150 }, { surface: "vinyl" }).steps).toEqual([]);
    expect(run({ cya: 120 }).steps[0]).toMatchObject({
      product: "Drain and refill about 70%",
      amount: null,
    });
    expect(run({ cya: 0 }).steps[0]).toMatchObject({ key: "cya", amount: "6.7 lb" });
  });

  it("salt pools aim higher on stabilizer and check salt", () => {
    expect(targets("plaster", "salt").cya.target).toBe(70);
    const r = run({ salt: 2400, cya: 70 }, { sanitizer: "salt" });
    // +800 ppm in 20,000 gal: 8 × 8.34 lb × 2 = 133 lb.
    expect(r.steps[0]).toMatchObject({
      product: "Pool salt",
      amount: "133 lb",
      measure: "3½ bags",
    });
  });

  it("free chlorine target follows stabilizer", () => {
    expect(targets("plaster", "chlorine", 80).fc.low).toBe(6);
    expect(targets("plaster", "chlorine", 0).fc.low).toBe(2);
  });
});

describe("saturation index", () => {
  it("balanced water is near zero", () => {
    const lsi = saturationIndex({ ph: 7.5, ta: 100, ch: 300, cya: 40, tempF: 80 }, "chlorine");
    expect(lsi).toBeGreaterThan(-0.3);
    expect(lsi).toBeLessThan(0.3);
    expect(run({ ph: 7.0, ta: 50, ch: 100, tempF: 60 }).lsiLabel).toBe("Corrosive");
    expect(run({ ph: 8.2, ta: 150, ch: 600, tempF: 90 }).lsiLabel).toBe("Scale forming");
    expect(saturationIndex({ ph: 7.5 }, "chlorine")).toBeNull();
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

describe("surface", () => {
  it("comes from the pool's type, plaster when unknown", async () => {
    const { surfaceFor } = await import("../src");
    expect(surfaceFor("vinyl")).toBe("vinyl");
    expect(surfaceFor("fiberglass")).toBe("fiberglass");
    expect(surfaceFor("gunite_plaster")).toBe("plaster");
    expect(surfaceFor(null)).toBe("plaster");
  });
});
