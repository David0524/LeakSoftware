import { formatPhoneTyping, phoneCaret } from "@leakbook/core";

// Phone numbers format as they're typed (owner, 2026-10-20: "When you type in Phone numbers it
// should put the parentheses and dash in for you"), as the website's phone-format.tsx: the
// caret stays after the digit it was after, and deleting a ")" or "-" takes away the digit
// before it instead of the mark coming straight back. React Native gives the new text, not the
// caret, so where the edit happened is worked out from what changed.

const digitCount = (s: string) => s.replace(/\D/g, "").length;

/**
 * The field's next text and caret after the user changed `prev` to `raw`. `caret` is where the
 * edit left the caret in `raw`, when known; otherwise it's taken from the end of the change.
 */
export function phoneEdit(
  prev: string,
  raw: string,
  caret?: number,
): { text: string; caret: number } {
  let at = caret;
  if (at == null) {
    // The edit is between the common start and the common end of the two texts.
    let start = 0;
    while (start < prev.length && start < raw.length && prev[start] === raw[start]) start++;
    let end = 0;
    while (
      end < prev.length - start &&
      end < raw.length - start &&
      prev[prev.length - 1 - end] === raw[raw.length - 1 - end]
    )
      end++;
    at = raw.length - end;
  }
  let text = raw;
  let before = digitCount(raw.slice(0, at));
  // A mark was deleted (fewer characters, the same digits): take away the digit before it.
  if (raw.length < prev.length && digitCount(raw) === digitCount(prev) && before > 0) {
    const formatted = formatPhoneTyping(raw);
    if (digitCount(formatted) === digitCount(raw)) {
      const digits = raw.replace(/\D/g, "");
      text = digits.slice(0, before - 1) + digits.slice(before);
      before -= 1;
    }
  }
  const next = formatPhoneTyping(text);
  if (next === text && text === raw) return { text: raw, caret: at };
  return { text: next, caret: phoneCaret(next, before) };
}
