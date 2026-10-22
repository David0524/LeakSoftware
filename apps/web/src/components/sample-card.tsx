"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SAMPLE_TEXT } from "@leakbook/core";
import { deleteSampleAction, sendSampleAction } from "@/app/actions/sample";
import { orOffline } from "@/lib/offline";
import { useConfirm } from "./sheet";
import { Button, Notice, buttonClass } from "./ui";

/**
 * The card at the top of the sample job (owner, 2026-10-22: "open it to a finished report with
 * their own logo, then prompt 'Send yourself this report'"): what it is, Send Yourself This
 * Report (to the signed-in person's own email only), View Report, and Delete Sample.
 */
export function SampleCard({
  jobId,
  reportHref,
  hasLogo,
  email,
}: {
  jobId: string;
  reportHref: string;
  hasLogo: boolean;
  email: string;
}) {
  const [sent, send, sending] = useActionState(orOffline(sendSampleAction), {});
  const [removed, remove, removing] = useActionState(orOffline(deleteSampleAction), {});
  const [confirm, confirmSheet] = useConfirm();

  return (
    <section
      aria-labelledby="sample-title"
      data-testid="sample-card"
      className="card mb-6 max-w-3xl p-5"
    >
      <h2 id="sample-title" className="font-display text-xl font-bold">
        {SAMPLE_TEXT.title}
      </h2>
      <p className="mt-1">{SAMPLE_TEXT.body}</p>
      {hasLogo ? null : (
        <p className="mt-2 text-[0.9375rem] text-text-muted">
          {SAMPLE_TEXT.addLogo}{" "}
          <Link href="/settings/company" className="text-link underline-offset-4 hover:underline">
            {SAMPLE_TEXT.addLogoLink}
          </Link>
        </p>
      )}
      <form action={send} className="mt-4 flex flex-wrap items-center gap-3">
        <input type="hidden" name="job" value={jobId} />
        <Button type="submit" disabled={sending} className="max-sm:w-full">
          {sending ? SAMPLE_TEXT.sending : SAMPLE_TEXT.send}
        </Button>
        <a
          href={reportHref}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass("secondary", "max-sm:w-full")}
        >
          {SAMPLE_TEXT.view}
        </a>
      </form>
      {email ? (
        <p className="mt-2 text-[0.9375rem] text-text-muted">It goes to {email}, and only you.</p>
      ) : null}
      {sent.message ? (
        <div className="mt-3">
          <Notice tone={sent.link ? "warning" : "success"}>
            {sent.message}
            {/* No email on this server: open it as the customer would. */}
            {sent.link ? (
              <>
                {" "}
                <a
                  href={sent.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-link underline underline-offset-2"
                >
                  {SAMPLE_TEXT.view}
                </a>
              </>
            ) : null}
          </Notice>
        </div>
      ) : null}
      {sent.error || removed.error ? (
        <div className="mt-3">
          <Notice tone="error">{sent.error ?? removed.error}</Notice>
        </div>
      ) : null}
      <form
        action={remove}
        className="mt-3"
        onSubmit={async (e) => {
          // Asked first (an action sheet), then sent.
          if (e.currentTarget.dataset.confirmed === "1") return;
          e.preventDefault();
          const form = e.currentTarget;
          const ok = await confirm({
            title: SAMPLE_TEXT.deleteTitle,
            message: SAMPLE_TEXT.deleteMessage,
            confirmLabel: SAMPLE_TEXT.delete,
            destructive: true,
          });
          if (!ok) return;
          form.dataset.confirmed = "1";
          form.requestSubmit();
        }}
      >
        <input type="hidden" name="job" value={jobId} />
        <Button type="submit" kind="quiet" disabled={removing} className="-ml-5 text-status-fail">
          {SAMPLE_TEXT.delete}
        </Button>
      </form>
      {confirmSheet}
    </section>
  );
}
