import type { ChoiceOption } from "./pool-inspection";
import type { Verdict } from "./inspection";

// Checklist answers as one-tap icon buttons on phones (owner, 2026-10-22: "I actually like your
// icons… we'll need different icons for leaks vs maintenance vs pool inspections";
// docs/design/2026-10-22-phone-checklist.md). The icon comes from what an answer means, never
// from the job type's name, so every platform draws the same one. Ported to Swift in
// apps/ios/Sources/SundeckCore/AnswerIcons.swift.

/**
 * The glyphs (SF Symbols on iPhone; the same shapes drawn in SVG on the website and Android):
 * check `checkmark`, xmark `xmark`, drop `drop.fill`, exclamation `exclamationmark`, minus
 * `minus`, skip `forward.end.fill`.
 */
export type AnswerSymbol = "check" | "xmark" | "drop" | "exclamation" | "minus" | "skip";

/** The chosen icon's fill: the status colors, or the link blue for an answer with no flag. */
export type AnswerTone = "pass" | "fail" | "warning" | "excluded" | "plain";

export interface AnswerIcon {
  symbol: AnswerSymbol;
  tone: AnswerTone;
}

/** At most this many icons fit one phone line beside the name (four 44 pt targets). */
export const MAX_ANSWER_ICONS = 4;

const VERDICT_TONE: Record<Verdict, AnswerTone> = {
  ok: "pass",
  leaking: "fail",
  attention: "warning",
  na: "excluded",
};

/**
 * A checklist item's answer as an icon. Leak items: Not Leaking ✓, Leaking drop, Attention !,
 * N/A –. Maintenance (`done`): Done ✓, Needs Attention !, Skipped ⏭ (skipped this visit is a
 * choice, not "doesn't apply", so it isn't the N/A dash). Yes/no items read their words: Yes ✓,
 * No ✗, N/A –, colored by what they mean (No is the good answer: green).
 */
export function verdictIcon(answer: string | null | undefined, verdict: Verdict): AnswerIcon {
  const tone = VERDICT_TONE[verdict];
  if (answer === "yes_no")
    return { symbol: verdict === "ok" ? "xmark" : verdict === "na" ? "minus" : "check", tone };
  if (verdict === "na") return { symbol: answer === "done" ? "skip" : "minus", tone };
  if (verdict === "leaking") return { symbol: "drop", tone };
  if (verdict === "attention") return { symbol: "exclamation", tone };
  return { symbol: "check", tone };
}

const FLAG_SYMBOL: Record<NonNullable<ChoiceOption["flag"]>, AnswerSymbol> = {
  ok: "check",
  leaking: "drop",
  attention: "exclamation",
  na: "minus",
};

function wordSymbol(label: string): AnswerSymbol | null {
  const word = label.trim().toLowerCase();
  if (word === "yes") return "check";
  if (word === "no") return "xmark";
  if (word === "n/a" || word === "not applicable") return "minus";
  return null;
}

/**
 * A pool inspection question's options as icons, or null when they don't map cleanly (then the
 * question keeps its answer as one pill that opens a menu). Yes, No and Not applicable read their
 * words (✓ ✗ –); other options take their flag's icon (ok ✓, leaking drop, attention !, na –).
 * Null for more than four options, an option with neither, or two options with the same icon.
 */
export function choiceIcons(options: ChoiceOption[]): AnswerIcon[] | null {
  if (options.length < 2 || options.length > MAX_ANSWER_ICONS) return null;
  const icons: AnswerIcon[] = [];
  for (const o of options) {
    const symbol = wordSymbol(o.label) ?? (o.flag ? FLAG_SYMBOL[o.flag] : null);
    if (!symbol) return null;
    icons.push({ symbol, tone: o.flag ? VERDICT_TONE[o.flag] : "plain" });
  }
  return new Set(icons.map((i) => i.symbol)).size === icons.length ? icons : null;
}

/** The pill's word when nothing is chosen yet (the fallback menu). */
export const CHOOSE_LABEL = "Choose";
/** What an answer button or pill does, for VoiceOver's hint and the pill's description. */
export const CHOOSE_HINT = "Choose an answer";
