import { describe, expect, it } from "vitest";
import {
  autopayGroupFooter,
  autopayInvoiceLine,
  autopayNextTry,
  autopaySettings,
  autopayStatus,
  chargeConfirm,
  customerAutopayLine,
  payOverTimeLine,
  payOverTimeMethods,
  payOverTimeOn,
  payOverTimeStatus,
  savedMethodDetail,
  savedMethodLabel,
} from "./autopay";

const visa = { kind: "card", brand: "visa", last4: "4242", exp_month: 4, exp_year: 2030 };
const bank = { kind: "us_bank_account", last4: "6789", bank_name: "Chase" };

describe("saved methods", () => {
  it("names a card or bank account by its last four", () => {
    expect(savedMethodLabel(visa)).toBe("Visa •••• 4242");
    expect(savedMethodLabel({ ...visa, brand: "amex" })).toBe("American Express •••• 4242");
    expect(savedMethodLabel({ ...visa, brand: "unknown" })).toBe("Card •••• 4242");
    expect(savedMethodLabel(bank)).toBe("Chase •••• 6789");
    expect(savedMethodLabel({ ...bank, bank_name: " " })).toBe("Bank account •••• 6789");
  });
  it("says when a card expires", () => {
    expect(savedMethodDetail(visa, "2026-11-16")).toBe("Expires 04/30");
    expect(savedMethodDetail({ ...visa, exp_year: 2026, exp_month: 10 }, "2026-11-16")).toBe(
      "Expired 10/26",
    );
    expect(savedMethodDetail({ ...visa, exp_year: 2026, exp_month: 11 }, "2026-11-16")).toBe(
      "Expires 11/26",
    );
    expect(savedMethodDetail(bank, "2026-11-16")).toBe("Bank account");
  });
});

describe("settings", () => {
  it("defaults to on, two more tries three days apart, and Pay Over Time on", () => {
    expect(autopaySettings({})).toEqual({ on: true, retries: 2, retryDays: 3 });
    expect(autopaySettings({ autopay: false, autopay_retries: 0, autopay_retry_days: 7 })).toEqual({
      on: false,
      retries: 0,
      retryDays: 7,
    });
    expect(autopaySettings({ autopay_retries: 9, autopay_retry_days: 0 })).toEqual({
      on: true,
      retries: 2,
      retryDays: 3,
    });
    expect(payOverTimeOn(null)).toBe(true);
    expect(payOverTimeOn({ pay_over_time: false })).toBe(false);
  });
  it("schedules tries until they run out", () => {
    const s = autopaySettings({});
    expect(autopayNextTry("2026-11-30", 1, s)).toBe("2026-12-03");
    expect(autopayNextTry("2026-12-03", 2, s)).toBe("2026-12-06");
    expect(autopayNextTry("2026-12-06", 3, s)).toBeNull();
    expect(autopayNextTry("2026-11-30", 1, { ...s, retries: 0 })).toBeNull();
  });
});

describe("the Autopay group", () => {
  it("shows the status and what happens", () => {
    expect(autopayStatus(true, visa)).toEqual({ value: "On", method: "Visa •••• 4242" });
    expect(autopayStatus(false, visa).value).toBe("Off");
    expect(autopayStatus(false, null).method).toBe("No card or bank account on file");
    expect(autopayGroupFooter(false, true, visa)).toMatch(/off for your shop/);
    expect(autopayGroupFooter(true, true, visa)).toMatch(/charged to this card/);
    expect(autopayGroupFooter(true, false, null)).toMatch(/Send a link/);
  });
});

describe("an invoice's automatic charge", () => {
  it("reads for the office and the customer", () => {
    const paid = { autopay_status: "succeeded", autopay_method: "Visa •••• 4242" };
    expect(autopayInvoiceLine(paid)).toBe("Paid automatically with Visa •••• 4242");
    expect(customerAutopayLine(paid)).toBe("Paid automatically with Visa •••• 4242.");
    expect(
      autopayInvoiceLine({
        autopay_status: "failed",
        autopay_method: "Visa •••• 4242",
        autopay_failure: "Your card was declined",
        autopay_next_try: "2026-12-03",
      }),
    ).toBe("Autopay failed: Your card was declined. Trying again Dec 3.");
    expect(autopayInvoiceLine({ autopay_status: "failed" })).toBe("Autopay failed. No more tries.");
    expect(autopayInvoiceLine({})).toBeNull();
  });
  it("confirms a charge with the card fee spelled out", () => {
    const c = chargeConfirm({ method: visa, balanceCents: 16_400, feeBps: 300, customer: "Jane" });
    expect(c.title).toBe("Charge Visa •••• 4242?");
    expect(c.confirm).toBe("Charge $168.92");
    expect(c.message).toBe("Jane is charged $168.92 now. That includes the 3% card fee ($4.92).");
    const b = chargeConfirm({ method: bank, balanceCents: 16_400, feeBps: 300, customer: "Jane" });
    expect(b.feeCents).toBe(0);
    expect(b.confirm).toBe("Charge $164.00");
  });
});

describe("Pay Over Time", () => {
  it("offers only active methods, inside their limits", () => {
    const both = { affirm: true, klarna: true };
    expect(payOverTimeMethods(4_999, both)).toEqual([]);
    expect(payOverTimeMethods(5_000, both)).toEqual(["affirm", "klarna"]);
    expect(payOverTimeMethods(2_000_000, both)).toEqual(["affirm"]);
    expect(payOverTimeMethods(10_000, { affirm: false, klarna: true })).toEqual(["klarna"]);
    expect(payOverTimeLine(["affirm", "klarna"])).toBe("Pay over time with Affirm or Klarna");
    expect(payOverTimeLine([])).toBeNull();
  });
  it("explains how to turn them on", () => {
    expect(payOverTimeStatus(true, { affirm: false, klarna: false })).toMatch(
      /Settings › Payment methods/,
    );
    expect(payOverTimeStatus(true, { affirm: true, klarna: true })).toBe(
      "Affirm and Klarna are on in your Stripe account.",
    );
    expect(payOverTimeStatus(false, null)).toMatch(/^Off/);
  });
});
