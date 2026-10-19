"use client";

import { useState } from "react";
import { saveJobVisibility } from "@/app/actions/settings";
import { Segmented } from "./segmented";
import { SSwitch, SettingsForm } from "./settings-forms";

/**
 * Settings › Team: whether techs see every job and everyone's schedule, or only the jobs
 * they're on (as tech or second tech), whether they can make new jobs (owner, 2026-10-18), and
 * whether finishing a job needs a pool photo (owner, 2026-10-19). Owners always can.
 */
export function JobVisibilityForm({
  seesAll,
  makesJobs,
  finishPhoto,
}: {
  seesAll: boolean;
  makesJobs: boolean;
  finishPhoto: boolean;
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
      <SSwitch
        label="Require a pool photo to finish a job"
        name="require_finish_photo"
        defaultChecked={finishPhoto}
        hint="On: a visit can’t be marked Done, and a report can’t be sent, until the job has a photo."
      />
    </SettingsForm>
  );
}
