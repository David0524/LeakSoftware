import { describe, expect, it } from "vitest";
import {
  canRefund,
  refundAmount,
  refundableCents,
  refundButtonText,
  refundDoneText,
  refundedText,
  refundExplainer,
} from "../src";

const card = { amount_cents: 8000, method: "card", status: "succeeded", refunded_cents: 0 };
const sent = { status: "paid" };

describe("refunds", () => {
  it("refunds card and bank payments only", () => {
    expect(refundableCents(card)).toBe(8000);
    expect(refundableCents({ ...card, method: "ach" })).toBe(8000);
    expect(refundableCents({ ...card, method: "cash" })).toBe(0);
    expect(refundableCents({ ...card, method: "check" })).toBe(0);
    expect(refundableCents({ ...card, status: "pending" })).toBe(0);
    expect(refundableCents({ ...card, status: "refunded" })).toBe(0);
  });

  it("is for owners and admins on a sent invoice", () => {
    expect(canRefund("owner", sent, card)).toBe(true);
    expect(canRefund("admin", { status: "partially_paid" }, card)).toBe(true);
    expect(canRefund("tech", sent, card)).toBe(false);
    expect(canRefund(null, sent, card)).toBe(false);
    expect(canRefund("owner", { status: "void" }, card)).toBe(false);
    expect(canRefund("owner", sent, { ...card, method: "cash" })).toBe(false);
  });

  it("takes all of it or the part typed", () => {
    expect(refundAmount(false, "", 8000)).toEqual({ cents: 8000 });
    expect(refundAmount(true, "20", 8000)).toEqual({ cents: 2000 });
    expect(refundAmount(true, "$80.00", 8000)).toEqual({ cents: 8000 });
    expect(refundAmount(true, "80.01", 8000)).toEqual({ error: "Refund $80.00 or less." });
    expect(refundAmount(true, "0", 8000)).toEqual({ error: "Enter an amount, like 25.00." });
    expect(refundAmount(true, "abc", 8000)).toEqual({ error: "Enter an amount, like 25.00." });
    expect(refundAmount(false, "", 0)).toEqual({
      error: "Nothing is left to refund on this payment.",
    });
  });

  it("words", () => {
    expect(refundButtonText(2000)).toBe("Refund $20.00");
    expect(refundDoneText(2000)).toBe("Refunded $20.00.");
    expect(refundedText({ ...card, amount_cents: 6000, refunded_cents: 2000 })).toBe(
      "Refunded $20.00",
    );
    expect(refundedText({ ...card, status: "refunded", refunded_cents: 8000 })).toBeNull();
    expect(refundedText(card)).toBeNull();
    expect(refundExplainer("ach")).toMatch(/bank account/);
    expect(refundExplainer("card")).toMatch(/card through your Stripe account/);
  });
});
