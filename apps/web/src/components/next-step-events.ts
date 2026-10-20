"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { NextStep } from "@/lib/next-step";

// The Next Step bar's buttons do exactly what the inline buttons do (owner, 2026-10-20): the
// bar asks, and the section that owns the button (its sheet, its file picker, its form)
// answers.

const EVENT = "leakbook:next-step";

/** Ask the section on screen to do a step (open Add Test, take a photo, write the draft). */
export function requestNextStep(step: NextStep) {
  window.dispatchEvent(new CustomEvent<NextStep>(EVENT, { detail: step }));
}

/** Answer a step from the bar. The handler can change between renders. */
export function useNextStep(step: NextStep, handler: () => void) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<NextStep>).detail === step) latest.current();
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [step]);
}

// Whether Wrap-Up's report panel is on screen without a draft (it loads on its own), so the bar
// knows to offer Write Draft.
let draftWritable = false;
const draftListeners = new Set<() => void>();

export function setDraftWritable(value: boolean) {
  if (draftWritable === value) return;
  draftWritable = value;
  draftListeners.forEach((l) => l());
}

export function useDraftWritable() {
  return useSyncExternalStore(
    (onChange) => {
      draftListeners.add(onChange);
      return () => draftListeners.delete(onChange);
    },
    () => draftWritable,
    () => false,
  );
}

const NOT_TYPED = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

function typing(el: Element | null) {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !NOT_TYPED.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

/** A text field has focus, so the phone's keyboard is likely up. */
export function useTyping() {
  return useSyncExternalStore(
    (onChange) => {
      // During focusout the next element isn't focused yet: read it once focus has moved.
      const later = () => setTimeout(onChange, 0);
      document.addEventListener("focusin", later);
      document.addEventListener("focusout", later);
      return () => {
        document.removeEventListener("focusin", later);
        document.removeEventListener("focusout", later);
      };
    },
    () => typing(document.activeElement),
    () => false,
  );
}
