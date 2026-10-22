import { describe, expect, it } from "vitest";
import { choiceIcons, verdictIcon, verdictOptions } from "../src";

describe("answer icons", () => {
  const symbols = (answer: "leak" | "done" | "yes_no") =>
    verdictOptions({ answer }).map((o) => verdictIcon(answer, o.value).symbol);

  it("gives leaks, maintenance and yes/no items their own icons", () => {
    expect(symbols("leak")).toEqual(["check", "drop", "exclamation", "minus"]);
    expect(symbols("done")).toEqual(["check", "exclamation", "skip"]);
    // No, Yes, N/A: the words, colored by meaning (No is the good answer).
    expect(symbols("yes_no")).toEqual(["xmark", "check", "minus"]);
    expect(verdictIcon("yes_no", "ok").tone).toBe("pass");
    expect(verdictIcon("leak", "leaking").tone).toBe("fail");
  });

  it("maps pool inspection options by word, then flag", () => {
    expect(
      choiceIcons([
        { label: "Yes", flag: "ok" },
        { label: "No", flag: "attention" },
        { label: "Not applicable", flag: "na" },
      ]),
    ).toEqual([
      { symbol: "check", tone: "pass" },
      { symbol: "xmark", tone: "warning" },
      { symbol: "minus", tone: "excluded" },
    ]);
    expect(choiceIcons([{ label: "Yes" }, { label: "No" }])?.map((i) => i.tone)).toEqual([
      "plain",
      "plain",
    ]);
    expect(
      choiceIcons([
        { label: "Not leaking", flag: "ok" },
        { label: "Leaking", flag: "leaking" },
      ])?.map((i) => i.symbol),
    ).toEqual(["check", "drop"]);
  });

  it("falls back to the menu pill when icons don't fit", () => {
    expect(choiceIcons([{ label: "DE" }, { label: "Sand / media" }])).toBeNull();
    expect(
      choiceIcons([
        { label: "No leaks noted", flag: "ok" },
        { label: "Was solid", flag: "ok" },
      ]),
    ).toBeNull();
    expect(
      choiceIcons(["A", "B", "C", "D", "E"].map((label) => ({ label, flag: "ok" as const }))),
    ).toBeNull();
    expect(choiceIcons([{ label: "Yes" }])).toBeNull();
  });
});
