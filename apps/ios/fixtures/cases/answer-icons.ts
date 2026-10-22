import {
  CHOOSE_HINT,
  CHOOSE_LABEL,
  choiceIcons,
  verdictIcon,
  type ChoiceOption,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// answer-icons.ts (owner, 2026-10-22): checklist answers as one-tap icons on phones.

const yesNo: ChoiceOption[] = [
  { label: "Yes", flag: "ok" },
  { label: "No", flag: "attention" },
  { label: "Not applicable", flag: "na" },
];

export const answerIcons: ModuleCases = {
  verdictIcon: rule(
    (answer: string | null, verdict: "ok" | "leaking" | "attention" | "na") =>
      verdictIcon(answer, verdict),
    (["leak", "done", "yes_no", null, "choice"] as const).flatMap((a) =>
      (["ok", "leaking", "attention", "na"] as const).map(
        (v) => [a, v] as [string | null, typeof v],
      ),
    ),
  ),
  choiceIcons: rule(
    (options: ChoiceOption[]) => choiceIcons(options),
    [
      [yesNo],
      [
        [
          { label: "Yes", flag: "attention" },
          { label: "No", flag: "ok" },
        ],
      ],
      [[{ label: "Yes" }, { label: "No" }]],
      [[{ label: " yes " }, { label: "NO" }, { label: "N/A" }]],
      [
        [
          { label: "Not leaking", flag: "ok" },
          { label: "Leaking", flag: "leaking" },
          { label: "Not applicable", flag: "na" },
        ],
      ],
      [
        [
          { label: "Was solid and not cracked", flag: "ok" },
          { label: "Was cracked at area(s)", flag: "attention" },
        ],
      ],
      [
        [
          { label: "No leaks noted", flag: "ok" },
          { label: "Noted leak(s)", flag: "leaking" },
          { label: "Other" },
        ],
      ],
      [
        [
          { label: "No leaks noted", flag: "ok" },
          { label: "Was solid", flag: "ok" },
        ],
      ],
      [[{ label: "DE" }, { label: "Cartridge" }, { label: "Sand / media" }]],
      [["A", "B", "C", "D", "E"].map((label) => ({ label, flag: "ok" as const }))],
      [[{ label: "Yes" }]],
      [[]],
    ],
  ),
  CHOOSE_LABEL: rule(() => CHOOSE_LABEL, [[]]),
  CHOOSE_HINT: rule(() => CHOOSE_HINT, [[]]),
};
