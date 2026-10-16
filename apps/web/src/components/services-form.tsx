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
 * Settings › Company: what the shop does. Each line of work is its own experience on the
 * website and the phones (owner, 2026-10-16); "Both" is mainly for demos.
 */
export function ServicesForm({ services }: { services: Services }) {
  const [value, setValue] = useState<Services>(services);
  return (
    <SettingsForm action={saveServices} full>
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
      <p className="px-4 text-[0.9375rem] text-text-muted sm:px-0">{NOTE[value]}</p>
    </SettingsForm>
  );
}
