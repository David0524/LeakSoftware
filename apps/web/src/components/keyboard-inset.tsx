"use client";

import { useEffect } from "react";

// The phone's keyboard, in CSS (owner, 2026-10-26: "keyboard covers input fields"). On iPhone and
// Android browsers the keyboard doesn't shrink the page: it covers the bottom of it, so a sheet
// pinned to the bottom of the screen has its last field and its Save under the keys. The visual
// viewport knows where the keyboard is; this puts it in two variables on <html>, for anything
// fixed to the screen's bottom to stay above it:
//   --kb-inset   how far the keyboard (or any bar over the page's bottom) covers it
//   --vv-height  the height of what is left above it
// Mounted once, in the root layout.

/** Smaller gaps are the browser's own bars coming and going, not a keyboard. */
const KEYBOARD_MIN_PX = 100;

/** The keyboard's height from the window and its visual viewport; 0 when none is up. */
export function keyboardInset(
  windowHeight: number,
  viewport: { height: number; offsetTop: number },
): number {
  const covered = Math.round(windowHeight - viewport.height - viewport.offsetTop);
  return covered >= KEYBOARD_MIN_PX ? covered : 0;
}

export function KeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--kb-inset", `${keyboardInset(window.innerHeight, viewport)}px`);
      root.style.setProperty("--vv-height", `${Math.round(viewport.height)}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--kb-inset");
      root.style.removeProperty("--vv-height");
    };
  }, []);
  return null;
}
