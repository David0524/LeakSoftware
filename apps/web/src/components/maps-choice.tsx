"use client";

import { useState } from "react";

type Choice = "auto" | "apple" | "google";

/**
 * Which app addresses open in, on this phone or computer: one row, like a Settings row.
 * Kept in a cookie for a year so /maps can send each tap straight to the right app.
 */
export function MapsChoice({ initial }: { initial: Choice }) {
  const [choice, setChoice] = useState<Choice>(initial);
  return (
    <label className="flex min-h-11 items-center justify-between gap-3">
      <span className="font-medium">Directions open in</span>
      <select
        value={choice}
        onChange={(e) => {
          const v = e.target.value as Choice;
          setChoice(v);
          document.cookie = `lb_maps=${v}; path=/; max-age=31536000; samesite=lax`;
        }}
        className="min-h-11 rounded-xl border border-control-border bg-surface px-2 text-link"
      >
        <option value="auto">Automatic</option>
        <option value="apple">Apple Maps</option>
        <option value="google">Google Maps</option>
      </select>
    </label>
  );
}
