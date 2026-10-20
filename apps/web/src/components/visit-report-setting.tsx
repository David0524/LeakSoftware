"use client";

import { useState } from "react";
import { VISIT_REPORT_MODES, type VisitReportMode } from "@leakbook/core";
import { saveVisitReportMode } from "@/app/actions/settings";
import { Segmented } from "./segmented";
import { SettingsForm } from "./settings-forms";

/**
 * Settings › Report Templates › Visit reports (owner, 2026-10-20): send each maintenance
 * visit's report automatically, by hand, or not at all.
 */
export function VisitReportSetting({ initial }: { initial: VisitReportMode }) {
  const [mode, setMode] = useState(initial);
  return (
    <SettingsForm action={saveVisitReportMode} full>
      <div className="space-y-2 px-4 sm:px-0">
        <Segmented
          label="Send visit reports"
          name="visit_reports"
          value={mode}
          options={VISIT_REPORT_MODES.map((m) => ({ value: m.value, label: m.label }))}
          onChange={setMode}
        />
        <p className="text-[0.9375rem] text-text-muted">
          {VISIT_REPORT_MODES.find((m) => m.value === mode)?.hint}
        </p>
      </div>
    </SettingsForm>
  );
}
