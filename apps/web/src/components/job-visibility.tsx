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
      <p className="px-4 text-[0.9375rem] text-text-muted sm:px-0">
        {value === "all"
          ? "Techs see every job and everyone’s schedule."
          : "Techs see only jobs they’re on (as the tech or second tech), on the website and on their phones. Customers stay visible to everyone."}
      </p>
      <SSwitch
        label="Techs can make new jobs"
        name="techs_make_jobs"
        defaultChecked={makesJobs}
        hint="Off: only owners and admins add jobs, on the website and in the app."
      />
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
        hint="On: Complete Job waits until every checklist item is answered."
      />
      <SSwitch
        label="Take a pool photo first"
        name="require_finish_photo"
        defaultChecked={photo}
        hint="On: Complete Job, and sending a report, wait until the job has a photo."
      />
    </SettingsForm>
  );
}
