import {
  REFUND_AMOUNT_LABEL,
  REFUND_BUTTON,
  REFUND_FULL,
  REFUND_OFFLINE,
  REFUND_PART,
  REFUND_TITLE,
  REFUNDABLE_METHODS,
  canRefund,
  refundAmount,
  refundButtonText,
  refundDoneText,
  refundExplainer,
  refundableCents,
  refundedText,
  type RefundablePayment,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// refund.ts (owner, 2026-11-24: "how would we reverse a charge?"): who sees Refund, how much it
// takes, and the Refund Payment sheet's words.

const card: RefundablePayment = {
  amount_cents: 8000,
  method: "card",
  status: "succeeded",
  refunded_cents: 0,
};
const payments: RefundablePayment[] = [
  card,
  { ...card, method: "ach" },
  { ...card, method: "cash" },
  { ...card, method: "check" },
  { ...card, method: "other" },
  { ...card, status: "pending" },
  { ...card, status: "failed" },
  { ...card, status: "refunded", refunded_cents: 8000 },
  { ...card, amount_cents: 6000, refunded_cents: 2000 },
  { ...card, amount_cents: 0, refunded_cents: 8000 },
  { amount_cents: 8000, method: "card", status: "succeeded" },
];

export const refunds: ModuleCases = {
  constants: rule(
    () => ({
      REFUNDABLE_METHODS,
      REFUND_BUTTON,
      REFUND_TITLE,
      REFUND_FULL,
      REFUND_PART,
      REFUND_AMOUNT_LABEL,
      REFUND_OFFLINE,
    }),
    [[]],
  ),
  refundableCents: rule(
    (p: RefundablePayment) => refundableCents(p),
    payments.map((p) => [p]),
  ),
  canRefund: rule(
    (role: string | null, status: string, p: RefundablePayment) => canRefund(role, { status }, p),
    [
      ["owner", "paid", card],
      ["admin", "partially_paid", card],
      ["owner", "sent", { ...card, method: "ach" }],
      ["tech", "paid", card],
      ["viewer", "paid", card],
      [null, "paid", card],
      ["owner", "void", card],
      ["owner", "draft", card],
      ["owner", "paid", { ...card, method: "cash" }],
      ["owner", "paid", { ...card, status: "refunded", refunded_cents: 8000 }],
      ["owner", "paid", { ...card, amount_cents: 0, refunded_cents: 8000 }],
      ["owner", "sent", { ...card, amount_cents: 6000, refunded_cents: 2000 }],
    ],
  ),
  refundAmount: rule(
    (part: boolean, typed: string, refundable: number) => refundAmount(part, typed, refundable),
    [
      [false, "", 8000],
      [false, "abc", 8000],
      [true, "20", 8000],
      [true, "$80.00", 8000],
      [true, " 12.5 ", 8000],
      [true, "1,000", 200000],
      [true, "80.01", 8000],
      [true, "0", 8000],
      [true, "-5", 8000],
      [true, "", 8000],
      [true, "abc", 8000],
      [true, "1.234", 8000],
      [false, "", 0],
      [true, "5", 0],
    ],
  ),
  refundExplainer: rule((m: string) => refundExplainer(m), [["card"], ["ach"], ["cash"]]),
  refundButtonText: rule((c: number) => refundButtonText(c), [[2000], [8000], [123456], [5]]),
  refundDoneText: rule((c: number) => refundDoneText(c), [[2000], [123456]]),
  refundedText: rule(
    (p: RefundablePayment) => refundedText(p),
    payments.map((p) => [p]),
  ),
};
