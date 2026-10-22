"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { markStop } from "@/app/actions/inspection";
import { orOffline } from "@/lib/offline";
import type { SendPrompt } from "./job-work";
import { saveFailed, useSetJobStatus } from "./instant";
import { useConfirm } from "./sheet";
import { buttonClass, cx } from "./ui";

/**
 * Mark Complete on a Today stop (owner, 2026-10-19: every stop on the day's route). A
 * maintenance visit is completed; a leak or repair job's stop is done for the day and its
 * report and invoice still follow. When the shop wants the checklist or a photo first, it says
 * so and links to the job. A stop marked by mistake is marked not complete again, and a
 * completed visit is reopened (owner, 2026-10-20: core todayUndo). When completing sends the
 * visit report (Automatic shops), it asks first (owner, 2026-10-20).
 */
export function TodayComplete({
  jobId,
  customer,
  done,
  maintenance,
  undo,
  prompt = null,
  buttonClassName,
  inRow = false,
  onCompleting,
  onCompleted,
}: {
  /** Completing is under way (Today's card arms its slide to the next stop). */
  onCompleting?: () => void;
  /** Completed (Today's card says so in the top banner, with Undo). */
  onCompleted?: () => void;
  /** The button's look in place of the usual one (Today's card, on water blue). */
  buttonClassName?: string;
  /**
   * On a stop's row: "Complete" and tighter pills, so Complete, Do Later and the contact buttons
   * fit on one line (owner, 2026-10-22: "I don't like these being on 2 rows").
   */
  inRow?: boolean;
  jobId: string;
  customer: string;
  done: boolean;
  /** A maintenance visit (completing it completes the job). */
  maintenance: boolean;
  /** What a done stop offers here: Reopen Visit, Mark Not Complete, or nothing. */
  undo: "Reopen Visit" | "Mark Not Complete" | null;
  /** Asked before completing a visit whose report goes out by itself. */
  prompt?: SendPrompt;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  // Done shows at once, the way the phones do (owner, 2026-10-22): the button turns into its
  // undo and the banner says so. A save that fails puts it back and says why, with the job.
  const [shown, show] = useOptimistic(done);
  const setStatus = useSetJobStatus();
  const [confirm, confirmSheet] = useConfirm();
  // What the stop offers once done: the server's answer, or while it saves, what it will say
  // (core todayUndo: a visit reopens; a leak or repair stop is marked not complete).
  const after =
    shown && !done ? (undo ?? (maintenance ? "Reopen Visit" : "Mark Not Complete")) : undo;
  if (shown && !after) return null;
  const run = (complete: boolean) =>
    start(async () => {
      show(complete);
      // A visit's status changes with it (Jobs, the job page).
      if (maintenance) setStatus(jobId, complete ? "done" : "in_progress");
      if (complete) onCompleted?.();
      const form = new FormData();
      form.set("job", jobId);
      form.set("complete", String(complete));
      const result = await orOffline(markStop)({}, form);
      if (result.error)
        saveFailed(result.error, {
          label: "Open Job",
          onAction: () => router.push(`/jobs/${jobId}`),
        });
    });
  return (
    <div className="space-y-1">
      <button
        type="button"
        aria-label={`${shown ? after : "Mark Complete"} for ${customer}`}
        onClick={async () => {
          if (!shown && prompt && !(await confirm({ ...prompt, alert: true }))) return;
          if (!shown) onCompleting?.();
          run(!shown);
        }}
        className={
          buttonClassName ??
          cx(
            buttonClass(shown ? "secondary" : "primary", cx("min-h-11", inRow ? "px-3.5" : "px-5")),
          )
        }
      >
        {shown ? after : inRow ? "Complete" : "Mark Complete"}
      </button>
      {confirmSheet}
    </div>
  );
}
