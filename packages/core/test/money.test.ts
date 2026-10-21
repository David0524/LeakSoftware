import { describe, expect, it } from "vitest";
import { formatCents, parseDollars } from "../src";

describe("money", () => {
  it("formats cents as dollars", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(-500)).toBe("-$5.00");
  });

  it("rejects non-integer cents", () => {
    expect(() => formatCents(1.5)).toThrow();
  });

  it("parses dollar input to cents without float error", () => {
    expect(parseDollars("1,234.56")).toBe(123456);
    expect(parseDollars("$12")).toBe(1200);
    expect(parseDollars("0.1")).toBe(10);
    expect(parseDollars("19.99")).toBe(1999);
    expect(parseDollars("-5")).toBe(-500);
    expect(parseDollars("12.345")).toBeNull();
    expect(parseDollars("abc")).toBeNull();
    expect(parseDollars("")).toBeNull();
  });

  it("reads commas only as thousands separators", () => {
    expect(parseDollars("1,234,567.89")).toBe(123456789);
    // A decimal comma is refused, not read as $15 or $150.
    expect(parseDollars("1,5")).toBeNull();
    expect(parseDollars("1,50")).toBeNull();
    expect(parseDollars("12,34,567")).toBeNull();
  });

  it("refuses amounts too large for the database", () => {
    expect(parseDollars("9999999.99")).toBe(999_999_999);
    expect(parseDollars("10000000")).toBeNull();
    expect(parseDollars("999999999999999999")).toBeNull();
  });
});
