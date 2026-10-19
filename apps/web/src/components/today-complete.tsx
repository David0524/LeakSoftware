"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { changeJobStatus } from "@/app/actions/inspection";
import { buttonClass, cx } from "./ui";

/**
 * Complete Job on a Today stop (owner, 2026-10-19: "there should be a way to mark that you're
 * onto the next job. Not everyone is going to want to go through the full process"). One tap
 * ends the visit; when the shop wants the checklist or a photo first, it says so and links to
 * the job.
 */
export function TodayComplete({ jobId, customer }: { jobId: string; customer: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="relative z-10 mt-2 space-y-1">
      <button
        type="button"
        disabled={pending}
        aria-label={`Complete Job for ${customer}`}
        onClick={() =>
          start(async () => {
            const form = new FormData();
            form.set("job", jobId);
            form.set("to", "done");
            const result = await changeJobStatus({}, form);
            setError(result.error ?? null);
          })
        }
        className={cx(buttonClass("secondary", "min-h-11 w-full sm:w-auto sm:px-6"))}
      >
        {pending ? "Completing…" : "Complete Job"}
      </button>
      {error ? (
        <p role="alert" className="text-[0.9375rem] text-status-fail">
          {error}{" "}
          <Link href={`/jobs/${jobId}`} className="font-semibold text-link underline">
            Open Job
          </Link>
        </p>
      ) : null}
    </div>
  );
}
