import { NEW_QUOTE_LABEL, WRAP_UP_ACTIONS, wrapUp, type WrapUpInput } from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// wrap-up.ts (owner, 2026-10-22, option A): the Wrap-Up finish list.

const base: WrapUpInput = {
  jobType: "detection",
  customer: "Maria Alvarez",
  reportOn: true,
  hasDraft: false,
  sentVersion: null,
  unsignedReason: null,
  findings: 0,
  tests: 0,
  signers: [],
  quotes: [],
  invoices: [],
};
const j = (o: Partial<WrapUpInput>): WrapUpInput => ({ ...base, ...o });
type Q = WrapUpInput["quotes"][number];
type I = WrapUpInput["invoices"][number];
const q = (id: string, status: Q["status"], o: Partial<Q> = {}): Q => ({
  id,
  number: 1006,
  status,
  total_cents: 125000,
  depositPaid: false,
  ...o,
});
const inv = (id: string, status: I["status"], paid = 0, o: Partial<I> = {}): I => ({
  id,
  number: 1025,
  status,
  total_cents: 64900,
  amount_paid_cents: paid,
  ...o,
});

export const wrapUpCases: ModuleCases = {
  wrapUp: rule(
    (input: WrapUpInput) => wrapUp(input),
    [
      [j({})],
      [j({ customer: null })],
      [j({ customer: "  " })],
      [j({ hasDraft: true })],
      [j({ hasDraft: true, findings: 1, tests: 0 })],
      [j({ hasDraft: true, findings: 0, tests: 1 })],
      [
        j({
          hasDraft: true,
          findings: 2,
          tests: 5,
          quotes: [q("a", "accepted", { depositPaid: true })],
          invoices: [inv("i", "draft")],
        }),
      ],
      [j({ hasDraft: true, quotes: [q("a", "accepted")] })],
      [
        j({
          hasDraft: true,
          quotes: [
            q("b", "draft", { number: 1007 }),
            q("a", "declined"),
            q("c", "expired", { number: null }),
          ],
        }),
      ],
      [j({ hasDraft: true, quotes: [q("a", "sent")] })],
      [j({ jobType: "repair", quotes: [q("a", "sent")] })],
      [j({ jobType: "inspection", quotes: [q("a", "draft")] })],
      [j({ hasDraft: true, signers: ["Maria Alvarez", " Maria Alvarez ", "Jo"] })],
      [j({ sentVersion: 2, unsignedReason: "Customer not present" })],
      [j({ sentVersion: 2, unsignedReason: "  " })],
      [j({ sentVersion: 1, hasDraft: true })],
      [j({ signers: ["Maria Alvarez"] })],
      [j({ sentVersion: 1, signers: ["Maria Alvarez"], invoices: [inv("i", "sent")] })],
      [j({ sentVersion: 1, signers: ["Maria"], invoices: [inv("i", "partially_paid", 27400)] })],
      [
        j({
          sentVersion: 1,
          signers: ["Maria"],
          invoices: [inv("v", "void", 0, { number: 1 }), inv("i", "paid", 64900, { number: 2 })],
        }),
      ],
      [
        j({
          invoices: [inv("a", "draft", 0, { number: null }), inv("b", "sent", 0, { number: 9 })],
        }),
      ],
      [j({ reportOn: false })],
      [j({ reportOn: false, quotes: [q("a", "sent")], invoices: [inv("i", "paid", 64900)] })],
      [j({ invoices: [inv("i", "sent", 99999)] })],
    ],
  ),
  WRAP_UP_ACTIONS: rule(() => WRAP_UP_ACTIONS, [[]]),
  NEW_QUOTE_LABEL: rule(() => NEW_QUOTE_LABEL, [[]]),
};
