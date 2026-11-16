import {
  AUTOPAY_TEXT,
  autopayGroupFooter,
  autopayInvoiceLine,
  autopayNextTry,
  autopaySettings,
  autopayStatus,
  chargeConfirm,
  savedMethodDetail,
  savedMethodLabel,
  type AutopayInvoice,
  type AutopaySettings,
  type SavedMethod,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// autopay.ts (docs/design/2026-11-16-autopay.md): the customer page's Autopay group and an
// invoice's automatic charge, in the apps' words.

const visa: SavedMethod = {
  kind: "card",
  brand: "visa",
  last4: "4242",
  exp_month: 4,
  exp_year: 2030,
};
const amex: SavedMethod = {
  kind: "card",
  brand: "amex",
  last4: "0005",
  exp_month: 10,
  exp_year: 2026,
};
const odd: SavedMethod = { kind: "card", brand: "cartes_bancaires", last4: "1111" };
const bank: SavedMethod = { kind: "us_bank_account", last4: "6789", bank_name: "Chase" };
const plainBank: SavedMethod = { kind: "us_bank_account", last4: "6789", bank_name: " " };
const methods = [visa, amex, odd, bank, plainBank];

export const autopay: ModuleCases = {
  AUTOPAY_TEXT: rule(() => AUTOPAY_TEXT, [[]]),
  savedMethodLabel: rule(
    (m: SavedMethod) => savedMethodLabel(m),
    methods.map((m) => [m]),
  ),
  savedMethodDetail: rule(
    (m: SavedMethod, today: string) => savedMethodDetail(m, today),
    [
      [visa, "2026-11-16"],
      [amex, "2026-11-16"],
      [amex, "2026-10-31"],
      [odd, "2026-11-16"],
      [bank, "2026-11-16"],
    ],
  ),
  autopaySettings: rule(
    (s: unknown) => autopaySettings(s),
    [
      [{}],
      [null],
      [{ autopay: false, autopay_retries: 0, autopay_retry_days: 7 }],
      [{ autopay_retries: 9, autopay_retry_days: 30 }],
    ],
  ),
  autopayNextTry: rule(
    (today: string, tries: number, s: AutopaySettings) => autopayNextTry(today, tries, s),
    [
      ["2026-11-30", 1, { on: true, retries: 2, retryDays: 3 }],
      ["2026-12-30", 2, { on: true, retries: 2, retryDays: 3 }],
      ["2026-12-06", 3, { on: true, retries: 2, retryDays: 3 }],
      ["2026-02-27", 1, { on: true, retries: 1, retryDays: 7 }],
      ["2026-11-30", 1, { on: true, retries: 0, retryDays: 3 }],
    ],
  ),
  autopayStatus: rule(
    (on: boolean, m: SavedMethod | null) => autopayStatus(on, m),
    [
      [true, visa],
      [false, bank],
      [true, null],
    ],
  ),
  autopayGroupFooter: rule(
    (shopOn: boolean, on: boolean, m: SavedMethod | null) => autopayGroupFooter(shopOn, on, m),
    [
      [false, true, visa],
      [true, true, visa],
      [true, false, visa],
      [true, false, null],
    ],
  ),
  autopayInvoiceLine: rule(
    (inv: AutopayInvoice) => autopayInvoiceLine(inv),
    [
      [{ autopay_status: "succeeded", autopay_method: "Visa •••• 4242" }],
      [{ autopay_status: "processing", autopay_method: "Chase •••• 6789" }],
      [
        {
          autopay_status: "failed",
          autopay_method: "Visa •••• 4242",
          autopay_failure: "Your card was declined.",
          autopay_next_try: "2026-12-03",
        },
      ],
      [{ autopay_status: "failed", autopay_failure: "Insufficient funds" }],
      [{ autopay_status: "failed" }],
      [{ autopay_status: "succeeded" }],
      [{}],
    ],
  ),
  chargeConfirm: rule(
    (m: SavedMethod, balance: number, bps: number, customer: string) =>
      chargeConfirm({ method: m, balanceCents: balance, feeBps: bps, customer }),
    [
      [visa, 16_400, 300, "Jane Smith"],
      [visa, 16_400, 0, "Jane Smith"],
      [visa, 12_345, 290, "Jane Smith"],
      [bank, 16_400, 300, "Jane Smith"],
    ],
  ),
};
