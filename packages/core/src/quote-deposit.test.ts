import { describe, expect, it } from "vitest";
import { depositFor } from "./quote";
import {
  depositRuleSummary,
  quoteDepositChoice,
  quoteDepositFromInput,
  quoteDepositInputs,
  quoteDepositLabel,
  quoteDepositRule,
} from "./quote-deposit";
import { searchSettings, settingsNoResults } from "./settings-search";

const shop = { type: "percent" as const, value_bps: 5000, minimum_cents: 0 };

describe("a quote's own deposit", () => {
  it("defaults to the shop's", () => {
    expect(quoteDepositChoice(null)).toBe("default");
    expect(quoteDepositLabel(null, shop)).toBe("Shop Default (50%)");
    expect(quoteDepositRule(null, shop)).toBe(shop);
  });
  it("reads and writes each choice", () => {
    const pct = quoteDepositFromInput("percent", "30", "");
    expect(pct).toEqual({ rule: { type: "percent", value_bps: 3000, minimum_cents: 0 } });
    const fixed = quoteDepositFromInput("fixed", "", "$1,250");
    expect(fixed).toEqual({ rule: { type: "fixed", value_cents: 125000, minimum_cents: 0 } });
    const none = quoteDepositFromInput("none", "", "");
    if (!("rule" in none) || !none.rule) throw new Error("no rule");
    expect(quoteDepositChoice(none.rule)).toBe("none");
    expect(quoteDepositLabel(none.rule, shop)).toBe("No Deposit");
    expect(depositFor(50000, none.rule)).toBe(0);
    expect(quoteDepositFromInput("percent", "0", "")).toEqual({
      error: "Enter a percent from 1 to 100.",
    });
    expect(quoteDepositFromInput("fixed", "", "x")).toEqual({
      error: "Enter an amount, like 250.",
    });
    expect(quoteDepositFromInput("default", "", "")).toEqual({ rule: null });
  });
  it("says it in a few words", () => {
    expect(depositRuleSummary({ type: "percent", value_bps: 2500, minimum_cents: 10000 })).toBe(
      "25%, at least $100.00",
    );
    expect(quoteDepositLabel({ type: "fixed", value_cents: 25000, minimum_cents: 0 }, shop)).toBe(
      "$250.00",
    );
    expect(quoteDepositInputs({ type: "fixed", value_cents: 25000, minimum_cents: 0 })).toEqual({
      percent: "",
      amount: "250.00",
    });
    expect(quoteDepositInputs({ type: "percent", value_bps: 3000, minimum_cents: 0 })).toEqual({
      percent: "30",
      amount: "",
    });
  });
});

describe("search settings", () => {
  const keys = ["company", "team", "payments", "reports", "tests"];
  it("finds a page by its name or a setting on it", () => {
    expect(searchSettings("dep", keys)).toEqual([
      { key: "payments", label: "Payments and Deposits", match: null },
    ]);
    expect(searchSettings("logo", keys)).toEqual([
      { key: "company", label: "Company and Branding", match: "Logo" },
    ]);
    expect(searchSettings("tech photo", keys)).toEqual([
      { key: "team", label: "Team", match: "Tech photos" },
    ]);
    expect(searchSettings("  ", keys)).toEqual([]);
    expect(searchSettings("pressure", ["company"])).toEqual([]);
    expect(settingsNoResults(" xyz ")).toBe("No Results for “xyz”");
  });
});
