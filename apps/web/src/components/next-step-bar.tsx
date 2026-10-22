"use client";

import { useState, useTransition, type ReactNode } from "react";
import { COMPLETE_READY_LINE, type JobStatus, type VisitReportBar } from "@leakbook/core";
import { changeJobStatus } from "@/app/actions/inspection";
import { orOffline } from "@/lib/offline";
import { NEXT_STEP_LABELS, nextStepButtons, type NextStep } from "@/lib/next-step";
import { CompleteJobButton, type SendPrompt } from "./job-work";
import { requestNextStep, useTyping } from "./next-step-events";
import { saveFailed, useJobStatus, useSetJobStatus } from "./instant";
import { Sheet } from "./sheet";
import { buttonClass, cx } from "./ui";

export interface NextStepJob {
  jobId: string;
  status: JobStatus;
  jobType: string;
  hasTestTypes: boolean;
  /** Asked before Complete Job when completing sends the visit report. */
  completePrompt: SendPrompt;
  /** The checklist is all done: Complete Job is the last thing (owner, 2026-10-22). */
  ready?: boolean;
  /** Wrap-Up's next step's action, null when every step is done (core wrapUp). */
  wrapUpAction?: string | null;
  /**
   * A maintenance visit's report (owner, 2026-10-22: "the visit report is really buried"): the
   * bar's line and button (core visitReportBar), the newest version's page, and the panel to
   * send it (again), which the line and Send Visit Report open in a sheet.
   */
  visitReport?: { bar: VisitReportBar; href: string | null; panel: ReactNode } | null;
}

/**
 * The Next Step bar (owner, 2026-10-20: one-handed use, item 1): on phones, the job page's next
 * one or two actions as pills in a bar pinned directly above the tab bar, on the tab bar's
 * frosted material (an iOS bottom toolbar, not a floating button). Hidden when it has nothing
 * to offer and while a text field has the keyboard up. Wider screens keep the header and inline
 * buttons; there it floats at the bottom only for a done maintenance visit's report (owner,
 * 2026-10-22).
 */
export function NextStepBar({ section, job }: { section: string; job: NextStepJob }) {
  const typing = useTyping();
  // A status change shows here at once (owner, 2026-10-22).
  const status = useJobStatus(job.jobId, job.status);
  const [sheet, setSheet] = useState(false);
  const visit = job.visitReport ?? null;
  const buttons: NextStep[] = nextStepButtons({
    ...job,
    status,
    section,
    visitAction: visit?.bar.action ?? null,
  });
  // Wider screens show every part on one page, with Complete Job in the header and under the
  // checklist: their bar floats at the bottom once a maintenance visit is done, for its report.
  const desktopButtons: NextStep[] = buttons.includes("visit-report") ? ["visit-report"] : [];
  // The visit report's line shows with its button, or above Complete Job (Automatic shops).
  const visitLine = (steps: NextStep[]) =>
    visit && (steps.includes("visit-report") || steps.includes("complete")) ? visit.bar.line : null;
  const ready = (steps: NextStep[]) => job.ready && steps.includes("complete");

  const bar = (steps: NextStep[], className: string) => {
    if (steps.length === 0) return null;
    const line = ready(steps) ? null : visitLine(steps);
    return (
      <div
        role="toolbar"
        aria-label="Next step"
        hidden={typing}
        className={cx("fixed inset-x-0 z-30 px-3", className)}
      >
        <div className="glass mx-auto flex max-w-3xl flex-wrap gap-2 rounded-[28px] p-2">
          {ready(steps) ? (
            <p
              className="w-full px-3 pt-1 text-center text-[0.9375rem] font-semibold"
              data-testid="complete-ready"
            >
              {COMPLETE_READY_LINE}
            </p>
          ) : null}
          {line ? (
            // The status opens the visit report's sheet: Send Again and the versions.
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setSheet(true)}
              className="flex min-h-11 w-full items-center justify-center gap-1 px-3 text-center text-[0.9375rem] font-semibold"
              data-testid="visit-report-line"
            >
              {line}
              <span aria-hidden="true" className="text-text-muted/70">
                ›
              </span>
            </button>
          ) : null}
          {steps.map((step, i) =>
            step === "complete" ? (
              <div key={step} className="min-w-0 flex-1">
                <CompleteJobButton
                  jobId={job.jobId}
                  prompt={job.completePrompt}
                  className="w-full"
                  ready={job.ready}
                />
              </div>
            ) : step === "start" ? (
              <StartJob key={step} jobId={job.jobId} />
            ) : step === "visit-report" && visit ? (
              <div key={step} className="min-w-0 flex-1">
                {visit.bar.action === "view" && visit.href ? (
                  <a
                    href={visit.href}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonClass("primary", "w-full px-3")}
                  >
                    {visit.bar.label}
                  </a>
                ) : (
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setSheet(true)}
                    className={buttonClass("primary", "w-full px-3")}
                  >
                    {visit.bar.label ?? NEXT_STEP_LABELS[step]}
                  </button>
                )}
              </div>
            ) : (
              // The tinted secondary pill sits on an opaque one, so the page doesn't show
              // through the frosted bar behind its label.
              <div key={step} className="min-w-0 flex-1 rounded-full bg-surface">
                <button
                  type="button"
                  onClick={() => requestNextStep(step)}
                  className={buttonClass(i === 0 ? "primary" : "secondary", "w-full px-3")}
                >
                  {step === "wrap-up" && job.wrapUpAction
                    ? job.wrapUpAction
                    : NEXT_STEP_LABELS[step]}
                </button>
              </div>
            ),
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Room for the last row to scroll above the bar. */}
      {buttons.length ? (
        <div aria-hidden="true" className={cx(visitLine(buttons) ? "h-32" : "h-20", "sm:hidden")} />
      ) : null}
      {desktopButtons.length ? <div aria-hidden="true" className="hidden h-28 sm:block" /> : null}
      {bar(
        buttons,
        "bottom-[calc(var(--tab-bar-top)+var(--tab-bar-row)+2px+var(--tab-bar-bottom))] sm:hidden",
      )}
      {bar(desktopButtons, "bottom-4 max-sm:hidden")}
      {visit ? (
        <Sheet open={sheet} onClose={() => setSheet(false)} title="Visit Report" doneOnly>
          {/* Its fields only send (nothing is kept to lose), so closing never asks. */}
          <div className="pt-2" data-autosave>
            {visit.panel}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

/** Start Job, as in the header (same action; it shows started at once, owner 2026-10-22). */
function StartJob({ jobId }: { jobId: string }) {
  const [pending, start] = useTransition();
  const setStatus = useSetJobStatus();
  return (
    <div className="min-w-0 flex-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setStatus(jobId, "in_progress");
            const form = new FormData();
            form.set("job", jobId);
            form.set("to", "in_progress");
            const result = await orOffline(changeJobStatus)({}, form);
            if (result.error) saveFailed(result.error);
          })
        }
        className={buttonClass("primary", "w-full")}
      >
        {NEXT_STEP_LABELS.start}
      </button>
    </div>
  );
}
