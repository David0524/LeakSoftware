"use client";

import { useEffect } from "react";
import { formatPhoneTyping, phoneCaret } from "@leakbook/core";

/**
 * Phone fields format themselves as they're typed (owner, 2026-10-20: "When you type in Phone
 * numbers it should put the parentheses and dash in for you"): every `type="tel"` input on the
 * site, from one listener in the root layout. The fields are uncontrolled, so the value is set
 * on the element; the caret stays after the digit it was after, and Delete just after a ")" or
 * "-" removes the digit before it instead of putting the mark straight back.
 */
export function PhoneFormatting() {
  useEffect(() => {
    function onInput(e: Event) {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || el.type !== "tel") return;
      let raw = el.value;
      const caret = el.selectionStart ?? raw.length;
      let before = raw.slice(0, caret).replace(/\D/g, "").length;
      const deleting = (e as InputEvent).inputType === "deleteContentBackward";
      const formatted = formatPhoneTyping(raw);
      const old = el.dataset.phoneLast ?? "";
      // Only a number this field formatted, so a "+44 …" number keeps its own spacing.
      const ours = /^(\(|\+1 )/.test(old);
      if (deleting && ours && formatted.replace(/\D/g, "") === raw.replace(/\D/g, "")) {
        // A mark was deleted: the number is unchanged, so take away the digit before the caret.
        if (old.replace(/\D/g, "").length === raw.replace(/\D/g, "").length && before > 0) {
          const digits = raw.replace(/\D/g, "");
          raw = digits.slice(0, before - 1) + digits.slice(before);
          before -= 1;
        }
      }
      const next = formatPhoneTyping(raw);
      el.dataset.phoneLast = next;
      if (next === el.value) return;
      el.value = next;
      const at = phoneCaret(next, before);
      el.setSelectionRange(at, at);
    }
    document.addEventListener("input", onInput, true);
    return () => document.removeEventListener("input", onInput, true);
  }, []);
  return null;
}
