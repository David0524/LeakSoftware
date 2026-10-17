import { describe, expect, it } from "vitest";
import {
  centsToDollars,
  invoiceBalance,
  invoiceShareText,
  invoiceTotals,
  toCsv,
  type InvoiceLine,
} from "../src";

const item = (quantity: number, unit_price_cents: number, taxable = true): InvoiceLine => ({
  kind: "item",
  quantity,
  unit_price_cents,
  taxable,
});

/** The repair from QUOTE_FIXTURE, invoiced with its 50% deposit credited (8.25% tax). */
export const INVOICE_FIXTURE = {
  lines: [
    item(1, 85_000),
    item(2.5, 12_999),
    item(1, 15_000, false),
    { kind: "deposit_credit", quantity: 1, unit_price_cents: -65_730, taxable: false },
  ] as InvoiceLine[],
  discount: 10_000,
  rate: 825,
};

describe("invoiceTotals", () => {
  it("taxes items like the quote and takes the deposit off after tax", () => {
    const { lines, discount, rate } = INVOICE_FIXTURE;
    expect(invoiceTotals(lines, discount, rate)).toEqual({
      subtotal_cents: 132_498,
      discount_cents: 10_000,
      tax_cents: 8_962,
      credit_cents: 65_730,
      total_cents: 65_730,
    });
  });

  it("ignores deleted lines and caps the discount at the subtotal", () => {
    const t = invoiceTotals(
      [item(1, 64_900, false), { ...item(1, 500), deleted_at: "2026-10-13T00:00:00Z" }],
      100_000,
      825,
    );
    expect(t).toEqual({
      subtotal_cents: 64_900,
      discount_cents: 64_900,
      tax_cents: 0,
      credit_cents: 0,
      total_cents: 0,
    });
  });
});

describe("invoice helpers", () => {
  it("never shows a negative balance", () => {
    expect(invoiceBalance({ total_cents: 64_900, amount_paid_cents: 20_000 })).toBe(44_900);
    expect(invoiceBalance({ total_cents: 64_900, amount_paid_cents: 70_000 })).toBe(0);
  });

  it("writes the text a tech sends", () => {
    expect(invoiceShareText("Demo Leak Co.", "https://x.test/i/abc")).toBe(
      "Demo Leak Co.: your invoice. View and pay it here: https://x.test/i/abc",
    );
  });
});

describe("CSV export", () => {
  it("quotes what needs quoting and defuses spreadsheet formulas", () => {
    expect(
      toCsv([
        ["Invoice", "Customer", "Total"],
        [2001, 'Rivera, "Riley"', centsToDollars(64_900)],
        [2002, "=HYPERLINK(1)", null],
        [2003, "Line one\nline two", -5],
      ]),
    ).toBe(
      'Invoice,Customer,Total\r\n2001,"Rivera, ""Riley""",649.00\r\n2002,\'=HYPERLINK(1),\r\n2003,"Line one\nline two",-5\r\n',
    );
    expect(toCsv([["\t=1+1"]])).toBe("'\t=1+1\r\n");
  });
});
