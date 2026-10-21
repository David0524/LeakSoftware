import { describe, expect, it } from "vitest";
import {
  LINE_DESCRIPTION_MAX,
  REVIEW_URL_ERROR,
  SIGNER_NAME_MAX,
  discountTooLarge,
  isWebUrl,
  jobDateError,
  lineDescriptionError,
  priceItemErrors,
  signerNameError,
} from "../src/lib/limits";

// The website's limits (apps/web/src/lib/limits.ts), the same rules and words on the phone.

describe("discounts", () => {
  it("can't be more than the subtotal", () => {
    expect(discountTooLarge(0, 10_000)).toBeNull();
    expect(discountTooLarge(10_000, 10_000)).toBeNull();
    expect(discountTooLarge(500_000, 10_000)).toBe("The discount can’t be more than the subtotal.");
    expect(discountTooLarge(1, 0)).toBe("The discount can’t be more than the subtotal.");
  });
});

describe("line descriptions", () => {
  it("are needed and at most 500 characters", () => {
    expect(lineDescriptionError("   ")).toBe("Describe the work.");
    expect(lineDescriptionError("Replace skimmer lid")).toBeNull();
    expect(lineDescriptionError("L".repeat(LINE_DESCRIPTION_MAX))).toBeNull();
    expect(lineDescriptionError(` ${"L".repeat(LINE_DESCRIPTION_MAX)} `)).toBeNull();
    expect(lineDescriptionError("L".repeat(LINE_DESCRIPTION_MAX + 1))).toBe(
      "Keep the description under 500 characters.",
    );
  });
});

describe("names and units", () => {
  it("a signer's name is at most 200 characters", () => {
    expect(signerNameError("Pat Lee")).toBeNull();
    expect(signerNameError("N".repeat(SIGNER_NAME_MAX))).toBeNull();
    expect(signerNameError("N".repeat(SIGNER_NAME_MAX + 1))).toBe(
      "Keep the name under 200 characters.",
    );
  });
  it("a price book item's name is at most 200, its unit 40", () => {
    expect(priceItemErrors("Skimmer lid", "each")).toEqual({});
    expect(priceItemErrors("N".repeat(201), "u".repeat(41))).toEqual({
      name: "Keep the name under 200 characters.",
      unit: "Keep the unit short, like each or hour.",
    });
    expect(priceItemErrors("N".repeat(200), "u".repeat(40))).toEqual({});
  });
});

describe("job dates", () => {
  it("are real days from 2000 to 2100", () => {
    expect(jobDateError("2026-10-21")).toBeNull();
    expect(jobDateError("2028-02-29")).toBeNull();
    expect(jobDateError("2000-01-01")).toBeNull();
    expect(jobDateError("2100-12-31")).toBeNull();
    expect(jobDateError("2027-02-29")).toBe("Pick a date.");
    expect(jobDateError("2026-02-31")).toBe("Pick a date.");
    expect(jobDateError("2026-13-45")).toBe("Pick a date.");
    expect(jobDateError("9999-12-31")).toBe("Pick a date between 2000 and 2100.");
    expect(jobDateError("0001-01-01")).toBe("Pick a date between 2000 and 2100.");
    expect(jobDateError("1999-12-31")).toBe("Pick a date between 2000 and 2100.");
    expect(jobDateError("2101-01-01")).toBe("Pick a date between 2000 and 2100.");
    expect(jobDateError("")).toBe("Pick a date.");
    expect(jobDateError("2026-1-5")).toBe("Pick a date.");
  });
});

describe("review links", () => {
  it("are web pages only", () => {
    expect(isWebUrl("https://g.page/r/demo")).toBe(true);
    expect(isWebUrl("http://example.com")).toBe(true);
    expect(isWebUrl("javascript:alert(document.cookie)")).toBe(false);
    expect(isWebUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isWebUrl("g.page/r/demo")).toBe(false);
    expect(REVIEW_URL_ERROR).toBe("Enter a web address that starts with https://.");
  });
});
