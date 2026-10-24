import { HEARD_FROM_OPTIONS, heardFromOther, parseHeardFrom } from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// heard-from.ts: "How did you hear about us?" on sign-up (owner, 2026-10-24).
export const heardFrom: ModuleCases = {
  HEARD_FROM_OPTIONS: rule(() => HEARD_FROM_OPTIONS, [[]]),
  parseHeardFrom: rule(
    (v: string | null) => parseHeardFrom(v),
    [[" Card "], ["google"], ["Laminate Card"], [""], [null], ["OTHER"]],
  ),
  heardFromOther: rule(
    (key: string | null, text: string | null) => heardFromOther(parseHeardFrom(key), text),
    [
      ["other", "  a  truck\nwrap "],
      ["other", "   "],
      ["google", "ignored"],
      [null, "ignored"],
      ["other", null],
      ["other", "x".repeat(150)],
      ["other", `${"y".repeat(99)} z`],
    ],
  ),
};
