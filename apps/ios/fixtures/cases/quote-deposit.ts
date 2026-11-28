import {
  QUOTE_DEPOSIT_TEXT,
  SETTINGS_SEARCH,
  SETTINGS_SEARCH_TEXT,
  depositRuleSummary,
  quoteDepositChoice,
  quoteDepositFromInput,
  quoteDepositInputs,
  quoteDepositLabel,
  searchSettings,
  settingsNoResults,
  type DepositRule,
  type QuoteDepositChoice,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// quote-deposit.ts and settings-search.ts (2026-11-27): a quote's own deposit, and Search Settings.

const shop: DepositRule = { type: "percent", value_bps: 5000, minimum_cents: 0 };
const rules: (DepositRule | null)[] = [
  null,
  { type: "percent", value_bps: 3000, minimum_cents: 0 },
  { type: "percent", value_bps: 2500, minimum_cents: 10000 },
  { type: "percent", value_bps: 0, minimum_cents: 0 },
  { type: "fixed", value_cents: 25000, minimum_cents: 0 },
  { type: "fixed", value_cents: 0, minimum_cents: 0 },
];
const choices: QuoteDepositChoice[] = ["default", "percent", "fixed", "none"];
const typed: [string, string][] = [
  ["30", ""],
  ["30%", ""],
  ["0", ""],
  ["101", ""],
  ["12.5", ""],
  ["", "250"],
  ["", "$1,250.50"],
  ["", "x"],
  ["", "0"],
];
const keys = Object.keys(SETTINGS_SEARCH);

export const quoteDeposit: ModuleCases = {
  QUOTE_DEPOSIT_TEXT: rule(() => QUOTE_DEPOSIT_TEXT, [[]]),
  quoteDepositChoice: rule(
    (r: DepositRule | null) => quoteDepositChoice(r),
    rules.map((r) => [r]),
  ),
  depositRuleSummary: rule(
    (r: DepositRule) => depositRuleSummary(r),
    [shop, ...rules.filter((r): r is DepositRule => !!r)].map((r) => [r]),
  ),
  quoteDepositLabel: rule(
    (r: DepositRule | null, s: DepositRule) => quoteDepositLabel(r, s),
    rules.map((r) => [r, shop] as [DepositRule | null, DepositRule]),
  ),
  quoteDepositFromInput: rule(
    (c: QuoteDepositChoice, p: string, a: string) => quoteDepositFromInput(c, p, a),
    choices.flatMap((c) =>
      typed.map(([p, a]) => [c, p, a] as [QuoteDepositChoice, string, string]),
    ),
  ),
  quoteDepositInputs: rule(
    (r: DepositRule | null) => quoteDepositInputs(r),
    rules.map((r) => [r]),
  ),
  SETTINGS_SEARCH: rule(() => SETTINGS_SEARCH, [[]]),
  SETTINGS_SEARCH_TEXT: rule(() => SETTINGS_SEARCH_TEXT, [[]]),
  settingsNoResults: rule((q: string) => settingsNoResults(q), [["deposit"], [" xyz "]]),
  searchSettings: rule(
    (q: string, k: string[]) => searchSettings(q, k),
    [
      ["dep", keys],
      ["deposit", keys],
      ["logo", keys],
      ["TECH photo", keys],
      ["  ", keys],
      ["pressure", ["company", "payments"]],
      ["report", keys],
      ["café", keys],
      ["on my way", keys],
    ],
  ),
};
