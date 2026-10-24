"use client";

import { useState } from "react";
import {
  VISIT_REPORT_TEXT,
  VISIT_REPORT_TIMINGS,
  visitReportModeFor,
  visitReportTiming,
  type VisitReportMode,
  type VisitReportTiming,
} from "@leakbook/core";
import { saveVisitReportMode } from "@/app/actions/settings";
import { Segmented } from "./segmented";
import { SettingsForm } from "./settings-forms";

function DocIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="mt-0.5 size-6 shrink-0 text-link"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  );
}

function InvoiceIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="mt-0.5 size-6 shrink-0 text-link"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

/**
 * Settings › Report Templates › Visit reports: when each maintenance visit's report goes
 * (owner, 2026-10-20 and 2026-10-24): Each Visit (with Send Automatically), Monthly with the
 * invoice, or Off. Saved as one company.settings.visit_reports value.
 */
export function VisitReportSetting({ initial }: { initial: VisitReportMode }) {
  const [timing, setTiming] = useState<VisitReportTiming>(visitReportTiming(initial));
  const [automatic, setAutomatic] = useState(initial === "auto");
  const mode = visitReportModeFor(timing, automatic);
  return (
    <SettingsForm action={saveVisitReportMode} full>
      <div className="space-y-3 px-4 sm:px-0" data-testid="visit-report-setting">
        <input type="hidden" name="visit_reports" value={mode} />
        <Segmented
          label={VISIT_REPORT_TEXT.title}
          name="visit_report_timing"
          value={timing}
          options={VISIT_REPORT_TIMINGS.map((t) => ({ value: t.value, label: t.label }))}
          onChange={(v) => setTiming(v as VisitReportTiming)}
        />
        {timing === "each" ? (
          <div>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
              <span className="font-medium">{VISIT_REPORT_TEXT.automatic}</span>
              <input
                type="checkbox"
                role="switch"
                className="ios-switch"
                checked={automatic}
                onChange={(e) => setAutomatic(e.target.checked)}
              />
            </label>
            <p className="text-[0.9375rem] text-text-muted">
              {automatic ? VISIT_REPORT_TEXT.automaticOn : VISIT_REPORT_TEXT.automaticOff}
            </p>
          </div>
        ) : timing === "monthly" ? (
          <div>
            <ul className="divide-y divide-separator rounded-xl bg-text/[0.04]">
              <li className="flex gap-3 px-4 py-3">
                <DocIcon />
                <span className="min-w-0">
                  <span className="block font-medium">{VISIT_REPORT_TEXT.monthlyWhat}</span>
                  <span className="block text-[0.9375rem] text-text-muted">
                    {VISIT_REPORT_TEXT.monthlyWhatDetail}
                  </span>
                </span>
              </li>
              <li className="flex gap-3 px-4 py-3">
                <InvoiceIcon />
                <span className="min-w-0">
                  <span className="block font-medium">{VISIT_REPORT_TEXT.monthlyWhen}</span>
                  <span className="block text-[0.9375rem] text-text-muted">
                    {VISIT_REPORT_TEXT.monthlyWhenDetail}
                  </span>
                </span>
              </li>
            </ul>
            <p className="mt-2 text-[0.9375rem] text-text-muted">
              {VISIT_REPORT_TEXT.monthlyFooter}
            </p>
          </div>
        ) : (
          <p className="text-[0.9375rem] text-text-muted">{VISIT_REPORT_TEXT.off}</p>
        )}
      </div>
    </SettingsForm>
  );
}
