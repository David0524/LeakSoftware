"use client";

import { useState } from "react";
import { saveJobVisibility } from "@/app/actions/settings";
import { Segmented } from "./segmented";
import { SettingsForm } from "./settings-forms";

/**
 * Settings › Team: whether techs see every job and everyone's schedule, or only the jobs
 * they're on (as tech or second tech). Owners always see everything.
 */
export function JobVisibilityForm({ seesAll }: { seesAll: boolean }) {
  const [value, setValue] = useState<"all" | "own">(seesAll ? "all" : "own");
  return (
    <SettingsForm action={saveJobVisibility}>
      <Segmented
        label="Techs see"
        name="techs_see"
        value={value}
        onChange={setValue}
        options={[
          { value: "all", label: "Every Job" },
          { value: "own", label: "Only Their Own" },
        ]}
      />
      <p className="text-[15px] text-text-muted">
        {value === "all"
          ? "Techs see every job and everyone’s schedule."
          : "Techs see only jobs they’re on (as the tech or second tech), on the website and on their phones. Customers stay visible to everyone."}
      </p>
    </SettingsForm>
  );
}
