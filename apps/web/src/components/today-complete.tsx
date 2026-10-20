"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { markStop } from "@/app/actions/inspection";
import { orOffline } from "@/lib/offline";
import type { SendPrompt } from "./job-work";
import { useConfirm } from "./sheet";
import { buttonClass, cx } from "./ui";

/**
 * Mark Complete on a Today stop (owner, 2026-10-19: every stop on the day's route). A
 * maintenance visit is completed; a leak or repair job's stop is done for the day and its
 * report and invoice still follow. When the shop wants the checklist or a photo first, it says
 * so and links to the job. A stop marked by mistake is marked not complete again. When
 * completing sends the visit report (Automatic shops), it asks first (owner, 2026-10-20).
 */
export function TodayComplete({
  jobId,
  customer,
  done,
  undoable,
  prompt = null,
}: {
  jobId: string;
  customer: string;
  done: boolean;
  /** Done only for the day (a leak or repair stop), so it can be undone here. */
  undoable: boolean;
  /** Asked before completing a visit whose report goes out by itself. */
  prompt?: SendPrompt;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmSheet] = useConfirm();
  if (done && !undoable) return null;
  const run = (complete: boolean) =>
    start(async () => {
      const form = new FormData();
      form.set("job", jobId);
      form.set("complete", String(complete));
      const result = await orOffline(markStop)({}, form);
      setError(result.error ?? null);
    });
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        aria-label={`${done ? "Mark Not Complete" : "Mark Complete"} for ${customer}`}
        onClick={async () => {
          if (!done && prompt && !(await confirm({ ...prompt, alert: true }))) return;
          run(!done);
        }}
        className={cx(buttonClass(done ? "secondary" : "primary", "min-h-11 px-5"))}
      >
        {pending ? "Saving…" : done ? "Mark Not Complete" : "Mark Complete"}
      </button>
      {error ? (
        <p role="alert" className="text-[0.9375rem] text-status-fail">
          {error}{" "}
          <Link href={`/jobs/${jobId}`} className="font-semibold text-link underline">
            Open Job
          </Link>
        </p>
      ) : null}
      {confirmSheet}
    </div>
  );
}
