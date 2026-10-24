import { describe, expect, it } from "vitest";
import {
  additionLabel,
  additionsCents,
  calculateChemistry,
  chargeChemicalsSettings,
  chargesChemicals,
  chemicalCardLine,
  chemicalItems,
  chemicalRows,
  chemicalTotals,
  convertQuantity,
  formatQuantity,
  gallonQuantity,
  dryQuantity,
  itemAddition,
  itemForChemical,
  monthlyUsage,
  openSuggestions,
  reportAddedRows,
  reportAddedTotal,
  stepQuantity,
  suggestedAddition,
  suggestionText,
  unitPriceLabel,
  waterTestRows,
  type ChemicalAddition,
  type ChemicalItem,
} from "../src";

// The seeded pool price book's chemicals (20261022003000_chemical_additions.sql).
const items: ChemicalItem[] = [
  {
    id: "cl",
    name: "Liquid chlorine",
    unit: "gal",
    price_cents: 800,
    category: "Chemicals",
    chemical: "liquid_chlorine",
    sort_order: 110,
  },
  {
    id: "acid",
    name: "Muriatic acid",
    unit: "gal",
    price_cents: 1500,
    category: "Chemicals",
    chemical: "muriatic_acid",
    sort_order: 120,
  },
  {
    id: "tabs",
    name: "Chlorine tabs (3″)",
    unit: "tab",
    price_cents: 250,
    category: "Chemicals",
    chemical: "tabs",
    sort_order: 122,
  },
  {
    id: "cya",
    name: "Stabilizer (CYA)",
    unit: "lb",
    price_cents: 900,
    category: "Chemicals",
    chemical: "stabilizer",
    sort_order: 130,
  },
  {
    id: "salt",
    name: "Salt, 40 lb bag",
    unit: "bag",
    price_cents: 1800,
    category: "Chemicals",
    chemical: "salt",
    sort_order: 140,
  },
  {
    id: "algae",
    name: "Algaecide",
    unit: "qt",
    price_cents: 1500,
    category: "Chemicals",
    chemical: "algaecide",
    sort_order: 152,
  },
  {
    id: "old",
    name: "Old chlorine",
    unit: "gal",
    price_cents: 500,
    category: "Chemicals",
    chemical: "liquid_chlorine",
    sort_order: 100,
    active: false,
  },
  { id: "pump", name: "Replace pump motor", unit: "each", price_cents: 65000, category: "Repair" },
];

// The design's visit: 20,000 gallons, FC 1 aiming for 4, pH 7.8, stabilizer 30 aiming for 40.
const visit = calculateChemistry({
  gallons: 20000,
  readings: { fc: 1, ph: 7.8, ta: 90, ch: 260, cya: 30 },
  chlorine: "liquid12",
  acid: "muriatic31",
  goals: { fc: 4, cya: 40 },
});

const add = (o: Partial<ChemicalAddition>): ChemicalAddition => ({
  id: "a",
  job_id: "j",
  property_id: "p",
  price_book_item_id: "cl",
  name: "Liquid chlorine",
  unit: "gal",
  reading_key: "fc",
  suggested_quantity: 0.5,
  quantity: 0.5,
  customer_supplied: false,
  note: null,
  unit_price_cents: 800,
  added_at: "2026-10-23T14:00:00Z",
  sort_order: 0,
  ...o,
});

describe("dose steps carry what to add, in the unit it's sold by", () => {
  it("gallons as the measure reads, pounds and bags by its steps", () => {
    expect(visit.steps.map((s) => [s.key, s.chemical, s.quantity, s.unit])).toEqual([
      ["ph", "muriatic_acid", 0.25, "gal"],
      ["cya", "stabilizer", 1.5, "lb"],
      ["fc", "liquid_chlorine", 0.5, "gal"],
    ]);
    expect(gallonQuantity(39)).toBe(0.33); // "⅓ gallon"
    expect(gallonQuantity(16)).toBe(0.13); // "2 cups"
    expect(gallonQuantity(4)).toBe(0.03); // a splash
    expect(gallonQuantity(300)).toBe(2.25);
    expect(dryQuantity(4)).toBe(0.25); // a scoop
    expect(dryQuantity(24 * 16)).toBe(24);
    expect(dryQuantity(3.5 * 40 * 16, 40)).toBe(3.5);
  });

  it("an action adds nothing", () => {
    const drain = calculateChemistry({
      gallons: 20000,
      readings: { ch: 900 },
      chlorine: "liquid12",
      acid: "muriatic31",
    });
    expect(drain.steps[0]).toMatchObject({ chemical: null, quantity: null, unit: null });
  });

  it("names products by the chemical the shop sells", () => {
    const hypo = calculateChemistry({
      gallons: 10000,
      readings: { fc: 1, ph: 7.2, ta: 60 },
      chlorine: "calhypo65",
      acid: "dryacid",
    });
    expect(hypo.steps.map((s) => s.chemical)).toEqual(["baking_soda", "soda_ash", "cal_hypo"]);
  });
});

describe("amounts in words", () => {
  it("reads quarters, thirds and halves; cups under a quarter gallon; plural tabs and bags", () => {
    expect(formatQuantity(0.5, "gal")).toBe("½ gal");
    expect(formatQuantity(2.75, "gal")).toBe("2¾ gal");
    expect(formatQuantity(0.33, "gal")).toBe("⅓ gal");
    expect(formatQuantity(0.13, "gal")).toBe("2 cups");
    expect(formatQuantity(0.03, "gal")).toBe("½ cup");
    expect(formatQuantity(1.5, "lb")).toBe("1½ lb");
    expect(formatQuantity(3, "tab")).toBe("3 tabs");
    expect(formatQuantity(1, "tab")).toBe("1 tab");
    expect(formatQuantity(2, "bag")).toBe("2 bags");
    expect(formatQuantity(1.2, "qt")).toBe("1.2 qt");
    expect(additionLabel({ quantity: 2, unit: "each", name: "Phosphate remover" })).toBe(
      "2 × Phosphate remover",
    );
    expect(additionLabel(add({}))).toBe("½ gal Liquid chlorine");
    expect(unitPriceLabel(800, "gal")).toBe("$8.00 / gal");
    expect(unitPriceLabel(3500, "each")).toBe("$35.00 each");
  });

  it("steps by the unit, snapping to the next whole step", () => {
    expect(stepQuantity(0.33, "gal", 1)).toBe(0.5);
    expect(stepQuantity(0.33, "gal", -1)).toBe(0.25);
    expect(stepQuantity(0.25, "gal", -1)).toBe(0.25);
    expect(stepQuantity(3, "tab", 1)).toBe(4);
    expect(stepQuantity(1.5, "lb", -1)).toBe(1);
  });

  it("converts between units it can", () => {
    expect(convertQuantity(0.5, "gal", "qt")).toBe(2);
    expect(convertQuantity(1.5, "lb", "oz")).toBe(24);
    expect(convertQuantity(1, "gal", "lb")).toBeNull();
  });
});

describe("suggestions become additions", () => {
  it("finds the shop's active item for the chemical, in price book order", () => {
    expect(itemForChemical(items, "liquid_chlorine")?.id).toBe("cl");
    expect(chemicalItems(items).map((i) => i.id)).toEqual([
      "cl",
      "acid",
      "tabs",
      "cya",
      "salt",
      "algae",
    ]);
  });

  it("takes the item's name, unit and price, and the suggested amount", () => {
    const fc = visit.steps.find((s) => s.key === "fc")!;
    expect(suggestionText(fc)).toBe("½ gal liquid chlorine");
    expect(suggestionText(visit.steps.find((s) => s.key === "cya")!)).toBe("1½ lb stabilizer");
    expect(suggestedAddition(fc, items)).toEqual({
      price_book_item_id: "cl",
      name: "Liquid chlorine",
      unit: "gal",
      reading_key: "fc",
      suggested_quantity: 0.5,
      quantity: 0.5,
      unit_price_cents: 800,
    });
  });

  it("without an item, the calculator's product at no price", () => {
    const ph = visit.steps.find((s) => s.key === "ph")!;
    expect(suggestedAddition(ph, [])).toMatchObject({
      price_book_item_id: null,
      name: "Muriatic acid",
      unit: "gal",
      quantity: 0.25,
      unit_price_cents: 0,
    });
  });

  it("an item picked on its own starts at one", () => {
    expect(itemAddition(items[2]!)).toMatchObject({
      name: "Chlorine tabs (3″)",
      quantity: 1,
      reading_key: null,
    });
    expect(itemAddition(items[0]!)).toMatchObject({ quantity: 1 });
  });
});

describe("the visit's rows", () => {
  it("one row per reading with its suggestion, what was added, and Also Added", () => {
    const added = [
      add({ id: "1" }),
      add({
        id: "2",
        reading_key: "ph",
        name: "Muriatic acid",
        unit_price_cents: 1500,
        quantity: 0.25,
      }),
      add({
        id: "3",
        reading_key: null,
        name: "Chlorine tabs (3″)",
        unit: "tab",
        quantity: 3,
        unit_price_cents: 250,
      }),
      add({ id: "gone", deleted_at: "2026-10-23T15:00:00Z" }),
    ];
    const { rows, extras } = chemicalRows(visit, added, items);
    expect(rows.map((r) => [r.key, r.order, r.added.map((a) => a.id)])).toEqual([
      ["fc", 3, ["1"]],
      ["ph", 1, ["2"]],
      ["ta", null, []],
      ["ch", null, []],
      ["cya", 2, []],
      ["salt", null, []],
    ]);
    expect(extras.map((a) => a.id)).toEqual(["3"]);
    expect(openSuggestions(rows)).toEqual([
      {
        price_book_item_id: "cya",
        name: "Stabilizer (CYA)",
        unit: "lb",
        reading_key: "cya",
        suggested_quantity: 1.5,
        quantity: 1.5,
        unit_price_cents: 900,
      },
    ]);
    // ½ gal × $8 + ¼ gal × $15 + 3 × $2.50
    expect(additionsCents(added)).toBe(400 + 375 + 750);
    expect(additionsCents([add({ customer_supplied: true })])).toBe(0);
    expect(chemicalCardLine("FC 1 · pH 7.8", added)).toBe("3 added · FC 1 · pH 7.8");
    expect(chemicalCardLine("", [])).toBe("Add today’s readings");
  });
});

describe("totals per chemical", () => {
  it("one line per chemical, unit and price; customer supplied apart and free", () => {
    const month = [
      add({ id: "a", quantity: 0.75, added_at: "2026-10-02T14:00:00Z" }),
      add({ id: "b", quantity: 1, added_at: "2026-10-09T14:00:00Z" }),
      add({ id: "c", quantity: 0.5, added_at: "2026-10-16T14:00:00Z" }),
      add({ id: "d", quantity: 0.5, added_at: "2026-10-23T14:00:00Z" }),
      add({
        id: "e",
        name: "Chlorine tabs (3″)",
        unit: "tab",
        quantity: 12,
        unit_price_cents: 250,
      }),
      add({
        id: "f",
        name: "Algaecide",
        unit: "qt",
        quantity: 1,
        unit_price_cents: 1500,
        customer_supplied: true,
      }),
      add({ id: "g", quantity: 9, deleted_at: "2026-10-24T00:00:00Z" }),
    ];
    expect(chemicalTotals(month)).toEqual([
      {
        name: "Liquid chlorine",
        unit: "gal",
        quantity: 2.75,
        unit_price_cents: 800,
        total_cents: 2200,
        customer_supplied: false,
      },
      {
        name: "Chlorine tabs (3″)",
        unit: "tab",
        quantity: 12,
        unit_price_cents: 250,
        total_cents: 3000,
        customer_supplied: false,
      },
      {
        name: "Algaecide",
        unit: "qt",
        quantity: 1,
        unit_price_cents: 0,
        total_cents: 0,
        customer_supplied: true,
      },
    ]);
    // A price change mid-month makes its own line.
    expect(chemicalTotals([add({}), add({ unit_price_cents: 900 })])).toHaveLength(2);
  });

  it("the pool's monthly use, newest month first, in the shop's time zone", () => {
    const rows = [
      add({ quantity: 0.5, added_at: "2026-10-23T14:00:00Z" }),
      add({ quantity: 0.5, unit_price_cents: 900, added_at: "2026-10-30T14:00:00Z" }),
      // 11:30 PM on Sept 30 in New York.
      add({ quantity: 1, added_at: "2026-10-01T03:30:00Z" }),
      add({
        name: "Chlorine tabs (3″)",
        unit: "tab",
        quantity: 3,
        added_at: "2026-10-23T14:00:00Z",
      }),
    ];
    expect(monthlyUsage(rows, "America/New_York")).toEqual([
      {
        month: "2026-10",
        label: "October",
        line: "1 gal Liquid chlorine, 3 tabs Chlorine tabs (3″)",
      },
      { month: "2026-09", label: "September", line: "1 gal Liquid chlorine" },
    ]);
  });
});

describe("the report's Added Chemicals", () => {
  const reading = { fc: 1, ph: 7.8, cya: 30 };
  const goals = { fc: 4, cya: 40 };
  const added = [
    {
      name: "Liquid chlorine",
      unit: "gal",
      quantity: 0.5,
      reading_key: "fc" as const,
      note: null,
      customer_supplied: false,
      unit_price_cents: 800,
    },
    {
      name: "Muriatic acid",
      unit: "gal",
      quantity: 0.25,
      reading_key: "ph" as const,
      note: null,
      customer_supplied: false,
      unit_price_cents: 1500,
    },
    {
      name: "Chlorine tabs",
      unit: "tab",
      quantity: 3,
      reading_key: null,
      note: "In the floater",
      customer_supplied: false,
      unit_price_cents: 250,
    },
    {
      name: "Algaecide",
      unit: "qt",
      quantity: 1,
      reading_key: null,
      note: null,
      customer_supplied: true,
      unit_price_cents: 1500,
    },
  ];

  it("says why, and prices only when the shop charged", () => {
    expect(reportAddedRows(added, reading, goals, true)).toEqual([
      {
        label: "½ gal Liquid chlorine",
        why: "To raise free chlorine",
        price: "$4.00",
        supplied: false,
      },
      { label: "¼ gal Muriatic acid", why: "To lower pH", price: "$3.75", supplied: false },
      { label: "3 tabs Chlorine tabs", why: "In the floater", price: "$7.50", supplied: false },
      { label: "1 qt Algaecide", why: null, price: null, supplied: true },
    ]);
    expect(reportAddedRows(added, reading, goals, false).every((r) => r.price === null)).toBe(true);
    expect(reportAddedTotal(added, true)).toBe("$15.25");
    expect(reportAddedTotal(added, false)).toBeNull();
  });

  it("the water test's Aim for shows the tech's level when one was set", () => {
    expect(waterTestRows(reading, goals).map((r) => [r.key, r.range, r.status])).toEqual([
      ["fc", "4", "low"],
      ["ph", "7.4–7.6", "high"],
      ["cya", "40", "low"],
    ]);
  });
});

describe("Charge for Chemicals", () => {
  it("is off until switched on, and starts the month it's switched on", () => {
    expect(chargesChemicals({})).toBe(false);
    expect(chargesChemicals({ charge_chemicals: true })).toBe(true);
    expect(chargeChemicalsSettings(true, "2026-10-24")).toEqual({
      charge_chemicals: true,
      charge_chemicals_from: "2026-10-01",
    });
    expect(chargeChemicalsSettings(false, "2026-10-24")).toEqual({ charge_chemicals: false });
  });
});
