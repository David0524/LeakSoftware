"use client";

import { useState } from "react";
import type { Services } from "@leakbook/core";
import { saveServices } from "@/app/actions/settings";
import { Segmented } from "./segmented";
import { SettingsForm } from "./settings-forms";

const NOTE: Record<Services, string> = {
  pool: "Cleaning routes, maintenance plans, the service checklist, the chemical calculator, repair quotes, and monthly billing. Leak detection is hidden.",
  leak: "Leak detection jobs, tests, findings, reports, repair quotes, and warranties. Cleaning plans and monthly billing are hidden.",
  both: "Everything for pool care and leak detection.",
};

/**
 * What the shop does: Pool Care, Leak Detection, or Both, with what each shows. One app, two
 * packages, and a combination for the rarer shop that does both (owner, 2026-10-16). Used
 * when signing up and in Settings › Company. Posts as `services`.
 */
export function ServicesChoice({ initial }: { initial: Services }) {
  const [value, setValue] = useState<Services>(initial);
  return (
    <div className="space-y-2">
      <Segmented
        label="Your shop does"
        name="services"
        value={value}
        onChange={setValue}
        options={[
          { value: "pool", label: "Pool Care" },
          { value: "leak", label: "Leak Detection" },
          { value: "both", label: "Both" },
        ]}
      />
      <p className="text-[0.9375rem] text-text-muted">{NOTE[value]}</p>
    </div>
  );
}

/** Settings › Company: what the shop does. */
export function ServicesForm({ services }: { services: Services }) {
  return (
    <SettingsForm action={saveServices} full>
      <div className="px-4 sm:px-0">
        <ServicesChoice initial={services} />
      </div>
    </SettingsForm>
  );
}
