"use client";

import { useSyncExternalStore } from "react";
import { THEME_EVENT, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";
import { SEGMENT_TRACK, cx, segmentClass } from "./ui";

function subscribe(fn: () => void) {
  addEventListener(THEME_EVENT, fn);
  addEventListener("storage", fn);
  return () => {
    removeEventListener(THEME_EVENT, fn);
    removeEventListener("storage", fn);
  };
}

const current = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function choose(value: Theme) {
  try {
    if (value === "light") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
  }
  document.documentElement.dataset.theme = value;
  dispatchEvent(new Event(THEME_EVENT));
}

function Sun() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function Moon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

/** One button: shows a moon in light mode (tap for dark) and a sun in dark mode. */
export function ThemeToggle({ onHeader = false }: { onHeader?: boolean }) {
  // Light until hydrated: the server can't know this browser's choice.
  const theme = useSyncExternalStore<Theme>(subscribe, current, () => "light");
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => choose(next)}
      aria-label={next === "dark" ? "Dark mode" : "Light mode"}
      title={next === "dark" ? "Dark mode" : "Light mode"}
      className={cx(
        "inline-flex size-11 items-center justify-center rounded-full",
        "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
        onHeader ? "text-on-header hover:bg-white/10" : "text-text hover:bg-text/[0.06]",
      )}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}

/**
 * More › Appearance on phones (the header's sun/moon button is for wider screens): a row with
 * Light and Dark as a segmented control, as in iOS Settings. Light is the default and the
 * device's own setting is not followed (owner, 2026-10-13), so there is no Automatic.
 */
export function AppearanceChoice() {
  const theme = useSyncExternalStore<Theme>(subscribe, current, () => "light");
  const options: { value: Theme; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <span id="appearance-label">Appearance</span>
      <div
        role="radiogroup"
        aria-labelledby="appearance-label"
        className={cx(SEGMENT_TRACK, "shrink-0 flex-nowrap")}
        onKeyDown={(e) => {
          const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
          if (!step) return;
          e.preventDefault();
          const next = theme === "dark" ? "light" : "dark";
          choose(next);
          e.currentTarget
            .querySelectorAll<HTMLButtonElement>("[role=radio]")
            [options.findIndex((o) => o.value === next)]?.focus();
        }}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={theme === o.value}
            tabIndex={theme === o.value ? 0 : -1}
            onClick={() => choose(o.value)}
            className={segmentClass(theme === o.value, "min-w-20")}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
