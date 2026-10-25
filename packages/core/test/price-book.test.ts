import { describe, expect, it } from "vitest";
import {
  priceBookCategory,
  priceBookCategoryChoices,
  priceBookCategoryStart,
  priceBookSections,
} from "../src/price-book";

const items = [
  { name: "Leak detection", category: "Detection" },
  { name: "Loose", category: null },
  { name: "Chlorine", category: "Chemicals" },
  { name: "Skimmer", category: " Repairs " },
  { name: "Acid", category: "Chemicals" },
  { name: "Misc", category: "Other" },
];

describe("priceBookSections", () => {
  it("puts Chemicals first and items without a category last", () => {
    expect(priceBookSections(items).map((s) => [s.category, s.items.length])).toEqual([
      ["Chemicals", 2],
      ["Detection", 1],
      ["Repairs", 1],
      ["Other", 1],
      ["", 1],
    ]);
  });
});

describe("category picker", () => {
  it("lists the shop's categories, Chemicals for pool shops, then Other once", () => {
    expect(priceBookCategoryChoices(items, false)).toEqual([
      "Chemicals",
      "Detection",
      "Repairs",
      "Other",
    ]);
    expect(priceBookCategoryChoices([{ category: "Repairs" }], true)).toEqual([
      "Chemicals",
      "Repairs",
      "Other",
    ]);
    expect(priceBookCategoryChoices([], false)).toEqual(["Other"]);
  });

  it("starts on the item's category, or Other with it written in", () => {
    const choices = ["Chemicals", "Repairs", "Other"];
    expect(priceBookCategoryStart("Repairs", choices)).toEqual({ choice: "Repairs", custom: "" });
    expect(priceBookCategoryStart(undefined, choices)).toEqual({ choice: "Other", custom: "" });
    expect(priceBookCategoryStart("Other", choices)).toEqual({ choice: "Other", custom: "" });
    expect(priceBookCategoryStart("Heaters", choices)).toEqual({
      choice: "Other",
      custom: "Heaters",
    });
  });

  it("saves the choice, the write-in, or Other when it's left blank", () => {
    expect(priceBookCategory("Repairs", "ignored")).toBe("Repairs");
    expect(priceBookCategory("Other", "  Heaters ")).toBe("Heaters");
    expect(priceBookCategory("Other", "  ")).toBe("Other");
  });
});
