"use client";

import { useLayoutEffect } from "react";
import { THEME_EVENT } from "@/lib/theme";

/**
 * Keeps the public site light whatever the office's Appearance is (owner, 2026-10-22). Leaving
 * for the office puts the person's own choice back.
 */
export function LightOnly() {
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.dataset.lightOnly = "";
    dispatchEvent(new Event(THEME_EVENT));
    return () => {
      delete html.dataset.lightOnly;
      dispatchEvent(new Event(THEME_EVENT));
    };
  }, []);
  return null;
}
