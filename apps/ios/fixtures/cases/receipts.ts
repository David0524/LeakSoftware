import {
  CHECK_NUMBER_HINT,
  CHECK_NUMBER_LABEL,
  CHECK_NUMBER_MAX,
  PAYMENT_METHOD_CHOICES,
  PAYMENT_METHOD_LABEL,
  RECEIPT_CHANNELS,
  RECEIPT_EMAIL_LABEL,
  RECEIPT_NOT_NOW,
  RECEIPT_OFFLINE,
  RECEIPT_PHONE_LABEL,
  RECEIPT_TEXT_HINT,
  SEND_RECEIPT,
  canRecordPayment,
  canSendReceipt,
  checkNumberError,
  cleanCheckNumber,
  latestReceiptPayment,
  paymentMethodLabel,
  receiptBalanceText,
  receiptPrompt,
  receiptRecipientError,
  receiptSentMessage,
  receiptSummary,
  receiptTextMessage,
  type ReceiptChannel,
  type ReceiptPayment,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// receipt.ts (owner, 2026-10-22: "A receipt for cash or check"): Record Payment's method and
// check number, and the Send Receipt sheet.

const check: ReceiptPayment = {
  id: "p2",
  amount_cents: 20000,
  method: "check",
  check_number: "1234",
  status: "succeeded",
  paid_at: "2026-10-22T17:00:00Z",
};
const cash: ReceiptPayment = {
  ...check,
  id: "p1",
  method: "cash",
  check_number: null,
  paid_at: "2026-10-21T17:00:00Z",
};
const pending: ReceiptPayment = {
  ...check,
  id: "p3",
  status: "pending",
  paid_at: "2026-10-23T17:00:00Z",
};
const partly = {
  number: 1042,
  status: "partially_paid",
  total_cents: 64900,
  amount_paid_cents: 20000,
};
const paid = { number: null, status: "paid", total_cents: 64900, amount_paid_cents: 64900 };

export const receipts: ModuleCases = {
  constants: rule(
    () => ({
      PAYMENT_METHOD_CHOICES,
      PAYMENT_METHOD_LABEL,
      CHECK_NUMBER_LABEL,
      CHECK_NUMBER_HINT,
      CHECK_NUMBER_MAX,
      SEND_RECEIPT,
      RECEIPT_NOT_NOW,
      RECEIPT_CHANNELS,
      RECEIPT_EMAIL_LABEL,
      RECEIPT_PHONE_LABEL,
      RECEIPT_TEXT_HINT,
      RECEIPT_OFFLINE,
    }),
    [[]],
  ),
  cleanCheckNumber: rule(
    (s: string | null) => cleanCheckNumber(s),
    [[" #1234 "], ["##12"], ["  "], [""], [null], ["A-77"]],
  ),
  checkNumberError: rule(
    (s: string | null) => checkNumberError(s),
    [["1234"], ["1".repeat(20)], ["1".repeat(21)], ["#" + "1".repeat(20)], [null]],
  ),
  paymentMethodLabel: rule(
    (m: string, n: string | null, a: "customer" | "office") => paymentMethodLabel(m, n, a),
    [
      ["cash", null, "customer"],
      ["check", "1234", "customer"],
      ["check", " #77 ", "office"],
      ["check", null, "customer"],
      ["card", null, "customer"],
      ["ach", null, "customer"],
      ["ach", null, "office"],
      ["other", null, "customer"],
      ["other", null, "office"],
      ["barter", null, "customer"],
    ],
  ),
  latestReceiptPayment: rule(
    (ps: ReceiptPayment[]) => latestReceiptPayment(ps)?.id ?? null,
    [[[cash, check, pending]], [[check, cash]], [[pending]], [[]], [[{ ...cash, paid_at: null }]]],
  ),
  canSendReceipt: rule(
    (status: string, ps: ReceiptPayment[]) => canSendReceipt({ status }, ps),
    [
      ["partially_paid", [check]],
      ["paid", [cash]],
      ["void", [check]],
      ["draft", [check]],
      ["sent", [pending]],
      ["sent", []],
    ],
  ),
  // Techs too (owner, 2026-10-22: "Techs should be able to record payments").
  canRecordPayment: rule(
    (role: string | null, status: string, total: number, paidCents: number) =>
      canRecordPayment(role, { status, total_cents: total, amount_paid_cents: paidCents }),
    [
      ["tech", "sent", 64900, 0],
      ["owner", "partially_paid", 64900, 20000],
      ["admin", "sent", 64900, 0],
      ["tech", "paid", 64900, 64900],
      ["tech", "draft", 64900, 0],
      ["tech", "void", 64900, 0],
      [null, "sent", 64900, 0],
      ["viewer", "sent", 64900, 0],
    ],
  ),
  receiptBalanceText: rule(
    (total: number, paidCents: number) =>
      receiptBalanceText({ total_cents: total, amount_paid_cents: paidCents }),
    [
      [64900, 20000],
      [64900, 64900],
      [100, 200],
    ],
  ),
  receiptSummary: rule(
    (p: ReceiptPayment, total: number, paidCents: number) =>
      receiptSummary(p, { total_cents: total, amount_paid_cents: paidCents }),
    [
      [check, 64900, 20000],
      [cash, 64900, 64900],
      [{ ...check, method: "other" }, 1000, 0],
    ],
  ),
  receiptPrompt: rule(
    (status: string) => receiptPrompt({ status }),
    [["paid"], ["partially_paid"]],
  ),
  receiptRecipientError: rule(
    (c: ReceiptChannel, to: string) => receiptRecipientError(c, to),
    [
      ["email", "sam@example.com"],
      ["email", " sam@example.com "],
      ["email", "sam"],
      ["email", ""],
      ["text", "602 555 0142"],
      ["text", "+1 (602) 555-0142"],
      ["text", "555-0142"],
      ["text", ""],
    ],
  ),
  receiptSentMessage: rule(
    (c: ReceiptChannel, to: string) => receiptSentMessage(c, to),
    [
      ["email", " sam@example.com "],
      ["text", "6025550142"],
      ["text", "+44 20 7946 0958"],
    ],
  ),
  receiptTextMessage: rule(
    (
      shop: string,
      p: ReceiptPayment,
      inv: { number: number | null; total_cents: number; amount_paid_cents: number },
    ) => receiptTextMessage(shop, p, inv, "https://x/i/t"),
    [
      ["Blue Wave Pools", check, partly],
      ["Blue Wave Pools", cash, paid],
    ],
  ),
};
