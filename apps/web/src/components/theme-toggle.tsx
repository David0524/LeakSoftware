"use client";

import { useSyncExternalStore } from "react";
import { THEME_EVENT, THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";
import { cx } from "./ui";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function subscribe(fn: () => void) {
  addEventListener(THEME_EVENT, fn);
  addEventListener("storage", fn);
  return () => {
    removeEventListener(THEME_EVENT, fn);
    removeEventListener("storage", fn);
  };
}

const current = () => (document.documentElement.dataset.themePref ?? "system") as ThemePreference;

function choose(value: ThemePreference) {
  try {
    if (value === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
    document.documentElement.dataset.themePref = value;
  }
  dispatchEvent(new Event(THEME_EVENT));
}

/** Segmented Auto / Light / Dark switch for the website's appearance. */
export function ThemeToggle({ onHeader = false }: { onHeader?: boolean }) {
  // null until hydrated: the server can't know this browser's choice.
  const pref = useSyncExternalStore(subscribe, current, () => null);
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={cx(
        "inline-flex rounded-md p-0.5 text-[15px]",
        onHeader ? "bg-white/10" : "border border-control-border bg-surface",
      )}
    >
      {OPTIONS.map((o) => {
        const on = pref === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => choose(o.value)}
            className={cx(
              "min-h-11 min-w-12 rounded px-2.5 font-medium",
              on
                ? onHeader
                  ? "bg-on-header text-header"
                  : "bg-text text-surface"
                : onHeader
                  ? "text-on-header hover:bg-white/10"
                  : "text-text hover:bg-neutral-100",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
