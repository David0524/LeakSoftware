"use client";

import { useRouter } from "next/navigation";

/**
 * "Go to date": the phone's own date picker, opening straight to a day (owner: picking a date
 * should be clearer than arrows alone). Keeps the other schedule settings (view, tech).
 */
export function DateJump({ value, view, tech }: { value: string; view: string; tech: string }) {
  const router = useRouter();
  return (
    // Phones: a calendar button (the date is already the page's subtitle); tapping it opens
    // the date picker. Wider screens show the date in the field.
    <label className="relative inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-control-border bg-surface px-3 max-sm:w-11 max-sm:justify-center max-sm:rounded-full max-sm:px-0">
      <svg
        viewBox="0 0 24 24"
        className="size-5 shrink-0 text-text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
      </svg>
      <span className="sr-only">Go to date</span>
      <input
        type="date"
        value={value}
        onChange={(e) => {
          if (!e.target.value) return;
          const next = new URLSearchParams({ view, date: e.target.value, tech });
          router.push(`/schedule?${next.toString()}`);
        }}
        className="min-h-10 min-w-0 bg-transparent font-medium max-sm:absolute max-sm:inset-0 max-sm:opacity-0"
      />
    </label>
  );
}
