"use client";

import { useActionState } from "react";
import {
  saveText,
  sendReportAction,
  writeDraft,
  type ReportFormState,
} from "@/app/actions/reports";
import type { ReportRow } from "@/lib/data";
import { CopyLink } from "./settings-forms";
import { Button, Notice, cx } from "./ui";

function Status({ state }: { state: ReportFormState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return null;
}

/** Write, edit, and send one template's report for a job. */
export function ReportPanel({
  jobId,
  template,
  name,
  draft,
  sent,
  customerEmail,
  emailReady,
  aiReady,
}: {
  jobId: string;
  template: "homeowner" | "partner";
  name: string;
  draft: ReportRow | null;
  sent: ReportRow[];
  customerEmail: string | null;
  emailReady: boolean;
  aiReady: boolean;
}) {
  const [draftState, draftAction, drafting] = useActionState(writeDraft, {});
  const [saveState, saveAction, saving] = useActionState(saveText, {});
  const [sendState, sendAction, sending] = useActionState(sendReportAction, {});
  const problems = draft?.ai_draft?.problems ?? [];
  const latestSent = sent.find((r) => r.status === "sent");

  return (
    <section
      aria-labelledby={`report-${template}`}
      className="rounded-lg border border-border bg-surface p-5"
      data-testid={`report-${template}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 id={`report-${template}`} className="font-display text-xl font-bold">
          {name}
        </h3>
        {latestSent?.token ? (
          <a
            href={`/r/${latestSent.token}`}
            target="_blank"
            rel="noreferrer"
            className="text-link underline"
          >
            View sent version {latestSent.version}
          </a>
        ) : null}
      </div>

      <form action={draftAction} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="job" value={jobId} />
        <input type="hidden" name="template" value={template} />
        <Button
          type="submit"
          kind={draft?.final_sections ? "secondary" : "primary"}
          disabled={drafting}
        >
          {drafting ? "Writing…" : draft?.final_sections ? "Write the Draft Again" : "Write Draft"}
        </Button>
        <span className="text-[15px] text-text-muted">
          {aiReady
            ? "Written from this job’s checklist, tests, and findings. You approve every word."
            : "AI writing isn’t set up yet; the draft is a plain summary of the job data."}
        </span>
      </form>
      <div className="mt-3">
        <Status state={draftState} />
      </div>

      {draft?.final_sections ? (
        <>
          {problems.length ? (
            <div className="mt-4">
              <Notice tone="warning">
                <p className="font-semibold">Check these before sending:</p>
                <ul className="mt-1 list-disc pl-5">
                  {problems.map((p, i) => (
                    <li key={i}>{p.message}</li>
                  ))}
                </ul>
              </Notice>
            </div>
          ) : null}
          <form action={saveAction} className="mt-4 space-y-4">
            <input type="hidden" name="job" value={jobId} />
            <input type="hidden" name="report" value={draft.id} />
            {draft.final_sections.map((s) => (
              <div key={s.key} className="space-y-1">
                <input type="hidden" name="key" value={s.key} />
                <input type="hidden" name="title" value={s.title} />
                <label htmlFor={`${draft.id}-${s.key}`} className="block font-medium">
                  {s.title}
                </label>
                <textarea
                  id={`${draft.id}-${s.key}`}
                  name="text"
                  defaultValue={s.text}
                  rows={Math.min(12, Math.max(3, s.text.split("\n").length + 2))}
                  className="block w-full rounded-md border border-control-border bg-surface px-3 py-2"
                />
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" kind="secondary" disabled={saving}>
                {saving ? "Saving…" : "Save Text"}
              </Button>
              <span
                aria-live="polite"
                className={cx(
                  "text-[15px]",
                  saveState.error ? "text-status-fail" : "text-status-pass",
                )}
              >
                {saveState.error ?? saveState.message}
              </span>
            </div>
          </form>

          <div className="mt-6 border-t border-border pt-4">
            <p className="font-medium">Send version {draft.version}</p>
            <p className="text-[15px] text-text-muted">
              Save your edits first. Sending locks this version; changes after that go out as a new
              version.
            </p>
            <form action={sendAction} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="job" value={jobId} />
              <input type="hidden" name="report" value={draft.id} />
              <div className="min-w-64 flex-1 space-y-1">
                <label htmlFor={`${draft.id}-to`} className="block font-medium">
                  Customer email
                </label>
                <input
                  id={`${draft.id}-to`}
                  name="to"
                  type="email"
                  defaultValue={customerEmail ?? ""}
                  className="block min-h-11 w-full rounded-md border border-control-border bg-surface px-3"
                />
              </div>
              <Button
                type="submit"
                name="channel"
                value="email"
                disabled={sending || !emailReady}
                title={emailReady ? undefined : "Email isn’t set up yet"}
              >
                {sending ? "Sending…" : "Send by Email"}
              </Button>
              <Button
                type="submit"
                name="channel"
                value="sms_device"
                kind="secondary"
                disabled={sending}
              >
                Send by Text
              </Button>
            </form>
            {!emailReady ? (
              <p className="mt-2 text-[15px] text-text-muted">
                Email isn’t set up yet. “Send by Text” gives you a link and message to text the
                customer.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="mt-3 space-y-3">
        <Status state={sendState} />
        {sendState.sms ? (
          <div className="space-y-2">
            <CopyLink url={sendState.sms} label="Message to text the customer" />
          </div>
        ) : null}
      </div>

      {sent.length ? (
        <div className="mt-6 border-t border-border pt-4">
          <p className="font-medium">Sent</p>
          <ul className="mt-2 space-y-1 text-[15px]">
            {sent.map((r) => (
              <li key={r.id}>
                Version {r.version} · {r.sent_at ? new Date(r.sent_at).toLocaleString() : ""}
                {r.status === "superseded" ? " · replaced" : ""}
                {r.token ? (
                  <>
                    {" · "}
                    <a
                      href={`/r/${r.token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-link underline"
                    >
                      Report
                    </a>
                    {" · "}
                    <a
                      href={`/r/${r.token}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-link underline"
                    >
                      PDF
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
