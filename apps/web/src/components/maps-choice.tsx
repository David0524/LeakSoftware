"use client";

import { useState } from "react";
import { Segmented } from "./segmented";

type Choice = "auto" | "apple" | "google";

/**
 * Which app addresses open in, on this phone or computer. Kept in a cookie for a year so
 * /maps can send each tap straight to the right app.
 */
export function MapsChoice({ initial }: { initial: Choice }) {
  const [choice, setChoice] = useState<Choice>(initial);
  return (
    <div>
      <Segmented
        label="Directions open in"
        name="maps_app"
        value={choice}
        onChange={(v) => {
          setChoice(v);
          document.cookie = `lb_maps=${v}; path=/; max-age=31536000; samesite=lax`;
        }}
        options={[
          { value: "auto", label: "Automatic" },
          { value: "apple", label: "Apple Maps" },
          { value: "google", label: "Google Maps" },
        ]}
      />
      <p className="mt-1 text-[15px] text-text-muted">
        {choice === "auto"
          ? "Apple Maps on iPhone, iPad, and Mac; Google Maps everywhere else."
          : "On this device only."}{" "}
        A whole day’s route always opens in Google Maps.
      </p>
    </div>
  );
}
