"use client";

import { useState } from "react";
import { saveCompleteJob, saveJobVisibility } from "@/app/actions/settings";
import { Segmented } from "./segmented";
import { SSwitch, SettingsForm } from "./settings-forms";

/**
 * Settings › Team: whether techs see every job and everyone's schedule, or only the jobs
 * they're on (as tech or second tech), and whether they can make new jobs (owner, 2026-10-18).
 * Owners always can.
 */
export function JobVisibilityForm({
  seesAll,
  makesJobs,
}: {
  seesAll: boolean;
  makesJobs: boolean;
}) {
  const [value, setValue] = useState<"all" | "own">(seesAll ? "all" : "own");
  return (
    <SettingsForm action={saveJobVisibility} full>
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
      {value === "own" ? (
        <p className="px-4 text-[0.9375rem] text-text-muted sm:px-0">
          Techs see only jobs they’re on. Customers stay visible to everyone.
        </p>
      ) : null}
      <SSwitch label="Techs can make new jobs" name="techs_make_jobs" defaultChecked={makesJobs} />
    </SettingsForm>
  );
}

/**
 * Settings › Team › Completing a job (owner, 2026-10-19: "Owners/admins can decide whether the
 * tech needs to fill out the checklist/submit picture first"): what Complete Job waits for.
 */
export function CompleteJobForm({ checklist, photo }: { checklist: boolean; photo: boolean }) {
  return (
    <SettingsForm action={saveCompleteJob} full>
      <SSwitch
        label="Finish the checklist first"
        name="require_checklist_to_finish"
        defaultChecked={checklist}
      />
      <SSwitch
        label="Take a pool photo first"
        name="require_finish_photo"
        defaultChecked={photo}
        hint="Reports need one too."
      />
    </SettingsForm>
  );
}
