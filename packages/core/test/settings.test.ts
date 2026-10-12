import { describe, expect, it } from "vitest";
import {
  bpsToPercent,
  configKey,
  contrastGrade,
  contrastRatio,
  formatFieldLines,
  isHexColor,
  parseFieldLines,
  percentToBps,
} from "../src";

describe("colors", () => {
  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBe(21);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
    // Brand navy on white; same either way round.
    expect(contrastRatio("#12263A", "#FFFFFF")).toBe(contrastRatio("#FFFFFF", "#12263A"));
    expect(contrastRatio("#12263A", "#FFFFFF")).toBeGreaterThan(14);
    expect(contrastGrade(4.5)).toBe("AA");
    expect(contrastGrade(3.2)).toBe("AA large");
    expect(contrastGrade(2)).toBe("Too low");
    expect(isHexColor("#a1B2c3")).toBe(true);
    expect(isHexColor("red")).toBe(false);
  });
});

describe("rates", () => {
  it("converts percentages to basis points and back", () => {
    expect(percentToBps("50")).toBe(5000);
    expect(percentToBps("8.25%")).toBe(825);
    expect(percentToBps("0")).toBe(0);
    expect(percentToBps("101")).toBeNull();
    expect(percentToBps("abc")).toBeNull();
    expect(percentToBps("1.234")).toBeNull();
    expect(bpsToPercent(825)).toBe("8.25");
    expect(bpsToPercent(5000)).toBe("50");
    expect(bpsToPercent(0)).toBe("0");
  });
});

describe("config keys", () => {
  it("slugs names and avoids taken keys", () => {
    expect(configKey("Return Line", [])).toBe("return_line");
    expect(configKey("Return Line", ["return_line"])).toBe("return_line_2");
    expect(configKey("  3-way valve ", [])).toBe("k_3_way_valve");
    expect(configKey("!!!", [])).toBe("item");
  });
});

describe("custom test fields", () => {
  it("parses one field per line", () => {
    const { fields, errors } = parseFieldLines(
      [
        "Location *",
        "Water temp (°F)",
        "Reading: number",
        "Observation: Leak / No leak / Unclear",
        "Notes: notes",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(fields).toEqual([
      { key: "location", label: "Location", type: "text", required: true },
      { key: "water_temp", label: "Water temp", type: "number", unit: "°F" },
      { key: "reading", label: "Reading", type: "number" },
      {
        key: "observation",
        label: "Observation",
        type: "select",
        options: ["Leak", "No leak", "Unclear"],
      },
      { key: "notes", label: "Notes", type: "textarea" },
    ]);
    expect(parseFieldLines(formatFieldLines(fields)).fields).toEqual(fields);
  });

  it("explains mistakes", () => {
    expect(parseFieldLines("").errors).toEqual(["Add at least one field."]);
    expect(parseFieldLines("Depth: inches").errors[0]).toMatch(/number, notes, or choices/);
    expect(parseFieldLines("Pick: One /").errors[0]).toMatch(/two choices/);
  });
});
