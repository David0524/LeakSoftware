import { formatCents } from "./money";
import type { DepositRule } from "./quote";

// A quote's own deposit (owner, 2026-11-27: "Allow the owner to adjust the deposit settings
// within the quote/invoice pages"; chose "Change it per quote"). Owners and admins set it on a
// draft quote: the shop's default (Settings › Payments and Deposits), a percent, a fixed amount,
// or no deposit. Stored as quote.deposit_rule (null = the shop's default); send_quote freezes
// it. The same on the website, iPhone (SundeckCore/QuoteDeposit.swift) and Android. No I/O.

export type QuoteDepositChoice = "default" | "percent" | "fixed" | "none";

export const QUOTE_DEPOSIT_TEXT = {
  row: "Deposit",
  title: "Deposit for This Quote",
  choices: {
    default: "Shop Default",
    percent: "Percent",
    fixed: "Fixed Amount",
    none: "No Deposit",
  } satisfies Record<QuoteDepositChoice, string>,
  percentLabel: "Percent of total",
  fixedLabel: "Amount",
  save: "Save",
  footer: "For this quote only. Change the shop’s default in Settings › Payments and Deposits.",
} as const;

/** The deposit a quote asks for: its own rule, else the shop's. */
export function quoteDepositRule(
  quoteRule: DepositRule | null | undefined,
  shopRule: DepositRule,
): DepositRule {
  return quoteRule ?? shopRule;
}

/** Which choice a quote's stored rule is. */
export function quoteDepositChoice(quoteRule: DepositRule | null | undefined): QuoteDepositChoice {
  if (!quoteRule) return "default";
  if (quoteRule.type === "fixed") return (quoteRule.value_cents ?? 0) > 0 ? "fixed" : "none";
  return (quoteRule.value_bps ?? 0) > 0 || (quoteRule.minimum_cents ?? 0) > 0 ? "percent" : "none";
}

/** A rule in a few words: "50%", "50%, at least $100.00", "$250.00", "None". */
export function depositRuleSummary(rule: DepositRule): string {
  if (quoteDepositChoice(rule) === "none") return "None";
  if (rule.type === "fixed") return formatCents(rule.value_cents ?? 0);
  const pct = `${(rule.value_bps ?? 0) / 100}%`;
  return rule.minimum_cents ? `${pct}, at least ${formatCents(rule.minimum_cents)}` : pct;
}

/** The Deposit row's value: "Shop Default (50%)", "30%", "$250.00", "No Deposit". */
export function quoteDepositLabel(
  quoteRule: DepositRule | null | undefined,
  shopRule: DepositRule,
): string {
  const choice = quoteDepositChoice(quoteRule);
  if (choice === "default")
    return `${QUOTE_DEPOSIT_TEXT.choices.default} (${depositRuleSummary(shopRule)})`;
  if (choice === "none") return QUOTE_DEPOSIT_TEXT.choices.none;
  return depositRuleSummary(quoteRule!);
}

/**
 * The rule to store for a choice, or an error to show. `percent` is what was typed ("30"),
 * `amount` dollars ("250" or "250.00"). Null rule = the shop's default.
 */
export function quoteDepositFromInput(
  choice: QuoteDepositChoice,
  percent: string,
  amount: string,
): { rule: DepositRule | null } | { error: string } {
  if (choice === "default") return { rule: null };
  if (choice === "none") return { rule: { type: "percent", value_bps: 0, minimum_cents: 0 } };
  if (choice === "percent") {
    const p = Number(percent.trim().replace(/%$/, ""));
    if (!Number.isFinite(p) || p <= 0 || p > 100)
      return { error: "Enter a percent from 1 to 100." };
    return { rule: { type: "percent", value_bps: Math.round(p * 100), minimum_cents: 0 } };
  }
  const dollars = Number(amount.trim().replace(/[$,]/g, ""));
  if (!Number.isFinite(dollars) || dollars <= 0) return { error: "Enter an amount, like 250." };
  return { rule: { type: "fixed", value_cents: Math.round(dollars * 100), minimum_cents: 0 } };
}

/** The fields' starting text for a stored rule: ["30", ""] or ["", "250.00"]. */
export function quoteDepositInputs(quoteRule: DepositRule | null | undefined): {
  percent: string;
  amount: string;
} {
  const choice = quoteDepositChoice(quoteRule);
  if (choice === "percent")
    return { percent: String((quoteRule!.value_bps ?? 0) / 100), amount: "" };
  if (choice === "fixed")
    return { percent: "", amount: ((quoteRule!.value_cents ?? 0) / 100).toFixed(2) };
  return { percent: "", amount: "" };
}
