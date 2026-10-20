"use client";

import { useState, useTransition } from "react";
import type { JobStatus } from "@leakbook/core";
import { changeJobStatus } from "@/app/actions/inspection";
import { orOffline } from "@/lib/offline";
import { NEXT_STEP_LABELS, nextStepButtons, type NextStep } from "@/lib/next-step";
import { CompleteJobButton, type SendPrompt } from "./job-work";
import { requestNextStep, useDraftWritable, useTyping } from "./next-step-events";
import { buttonClass } from "./ui";

export interface NextStepJob {
  jobId: string;
  status: JobStatus;
  jobType: string;
  hasTestTypes: boolean;
  /** Asked before Complete Job when completing sends the visit report. */
  completePrompt: SendPrompt;
}

/**
 * The Next Step bar (owner, 2026-10-20: one-handed use, item 1): on phones, the job page's next
 * one or two actions as pills in a bar pinned directly above the tab bar, on the tab bar's
 * frosted material (an iOS bottom toolbar, not a floating button). Hidden when it has nothing
 * to offer, while a text field has the keyboard up, and on wider screens, where the header and
 * inline buttons stay.
 */
export function NextStepBar({ section, job }: { section: string; job: NextStepJob }) {
  const canWriteDraft = useDraftWritable();
  const typing = useTyping();
  const buttons: NextStep[] = nextStepButtons({ ...job, section, canWriteDraft });
  if (buttons.length === 0) return null;
  return (
    <>
      {/* Room for the last row to scroll above the bar. */}
      <div aria-hidden="true" className="h-20 sm:hidden" />
      <div
        role="toolbar"
        aria-label="Next step"
        hidden={typing}
        className="fixed inset-x-0 bottom-[calc(var(--tab-bar-top)+var(--tab-bar-row)+2px+var(--tab-bar-bottom))] z-30 px-3 sm:hidden"
      >
        <div className="glass flex gap-2 rounded-[28px] p-2">
          {buttons.map((step, i) =>
            step === "complete" ? (
              <div key={step} className="min-w-0 flex-1">
                <CompleteJobButton
                  jobId={job.jobId}
                  prompt={job.completePrompt}
                  className="w-full"
                />
              </div>
            ) : step === "start" ? (
              <StartJob key={step} jobId={job.jobId} />
            ) : (
              // The tinted secondary pill sits on an opaque one, so the page doesn't show
              // through the frosted bar behind its label.
              <div key={step} className="min-w-0 flex-1 rounded-full bg-surface">
                <button
                  type="button"
                  onClick={() => requestNextStep(step)}
                  className={buttonClass(i === 0 ? "primary" : "secondary", "w-full px-3")}
                >
                  {NEXT_STEP_LABELS[step]}
                </button>
              </div>
            ),
          )}
        </div>
      </div>
    </>
  );
}

/** Start Job, as in the header (same action and errors). */
function StartJob({ jobId }: { jobId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="min-w-0 flex-1 space-y-1">
      {error ? (
        <p role="alert" className="px-2 text-[0.9375rem] text-status-fail">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const form = new FormData();
            form.set("job", jobId);
            form.set("to", "in_progress");
            const result = await orOffline(changeJobStatus)({}, form);
            setError(result.error ?? null);
          })
        }
        className={buttonClass("primary", "w-full")}
      >
        {NEXT_STEP_LABELS.start}
      </button>
    </div>
  );
}
