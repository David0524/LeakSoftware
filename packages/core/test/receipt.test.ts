import { describe, expect, it } from "vitest";
import {
  activityRow,
  canSendReceipt,
  checkNumberError,
  cleanCheckNumber,
  latestReceiptPayment,
  paymentMethodLabel,
  receiptBalanceText,
  receiptPrompt,
  receiptRecipientError,
  receiptRows,
  receiptSentMessage,
  receiptSummary,
  receiptTextMessage,
} from "../src";

const invoice = {
  number: 1042,
  status: "partially_paid",
  total_cents: 64900,
  amount_paid_cents: 20000,
};
const check = {
  id: "p2",
  amount_cents: 20000,
  method: "check",
  check_number: "1234",
  status: "succeeded",
  paid_at: "2026-10-22T17:00:00Z",
};

describe("receipts for cash and check", () => {
  it("cleans and checks a check number", () => {
    expect(cleanCheckNumber(" #1234 ")).toBe("1234");
    expect(cleanCheckNumber("  ")).toBeNull();
    expect(checkNumberError("1".repeat(20))).toBeNull();
    expect(checkNumberError("1".repeat(21))).toBe("Enter a check number up to 20 characters.");
  });

  it("names each method", () => {
    expect(paymentMethodLabel("cash")).toBe("Cash");
    expect(paymentMethodLabel("check", "1234")).toBe("Check #1234");
    expect(paymentMethodLabel("check", null)).toBe("Check");
    expect(paymentMethodLabel("other")).toBe("Other payment");
    expect(paymentMethodLabel("other", null, "office")).toBe("Recorded by the office");
    expect(paymentMethodLabel("ach", null, "office")).toBe("Bank");
  });

  it("finds the payment a receipt is for", () => {
    const cash = { ...check, id: "p1", method: "cash", paid_at: "2026-10-21T17:00:00Z" };
    const pending = { ...check, id: "p3", status: "pending", paid_at: "2026-10-23T17:00:00Z" };
    expect(latestReceiptPayment([cash, check, pending])?.id).toBe("p2");
    expect(latestReceiptPayment([pending])).toBeNull();
    expect(canSendReceipt(invoice, [check])).toBe(true);
    expect(canSendReceipt({ status: "void" }, [check])).toBe(false);
    expect(canSendReceipt(invoice, [pending])).toBe(false);
  });

  it("words the sheet, the text, and the email rows", () => {
    expect(receiptSummary(check, invoice)).toBe(
      "$200.00 · Check #1234 · Balance remaining $449.00",
    );
    expect(receiptBalanceText({ total_cents: 100, amount_paid_cents: 100 })).toBe("Paid in full");
    expect(receiptPrompt({ status: "paid" })).toBe("Paid in full. Send the customer a receipt?");
    expect(receiptTextMessage("Blue Wave Pools", check, invoice, "https://x/i/t")).toBe(
      "Blue Wave Pools: Thank you for your $200.00 payment (Check #1234). Balance remaining on Invoice #1042: $449.00. Your receipt: https://x/i/t",
    );
    expect(receiptRows(invoice, check, "October 22, 2026")).toEqual([
      { label: "Invoice", value: "#1042" },
      { label: "Payment date", value: "October 22, 2026" },
      { label: "Method", value: "Check #1234" },
      { label: "Amount paid", value: "$200.00" },
      { label: "Invoice total", value: "$649.00" },
      { label: "Balance remaining", value: "$449.00" },
    ]);
  });

  it("checks where it goes and says where it went", () => {
    expect(receiptRecipientError("email", "sam@example.com")).toBeNull();
    expect(receiptRecipientError("email", "sam")).toBe("Enter the customer’s email.");
    expect(receiptRecipientError("text", "602 555 0142")).toBeNull();
    expect(receiptSentMessage("text", "6025550142")).toBe("Receipt texted to (602) 555-0142.");
    expect(receiptSentMessage("email", " sam@example.com ")).toBe(
      "Receipt emailed to sam@example.com.",
    );
  });

  it("is an Activity event", () => {
    const r = activityRow(
      {
        id: "e",
        kind: "receipt_sent",
        created_at: "2026-10-22T17:00:00Z",
        job_id: "j",
        customer_name: "Sam Lee",
        amount_cents: 20000,
        preview: "text",
        actor_name: "Tony Reyes",
      },
      "2026-10-22T18:00:00Z",
      "America/Phoenix",
    );
    expect([r.symbol, r.title, r.detail]).toEqual([
      "payment",
      "Receipt sent",
      "Sam Lee, $200.00, texted by Tony",
    ]);
  });
});
