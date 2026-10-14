"use client";

import { useActionState, useState } from "react";
import {
  saveText,
  sendReportAction,
  writeDraft,
  type ReportFormState,
} from "@/app/actions/reports";
import { reviewWithCustomer } from "@/app/actions/sign-off";
import type { ReportRow } from "@/lib/data";
import { CopyLink } from "./settings-forms";
import { Button, Notice, buttonClass, cx } from "./ui";

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
}: {
  jobId: string;
  template: "homeowner" | "partner";
  name: string;
  draft: ReportRow | null;
  sent: ReportRow[];
  customerEmail: string | null;
  emailReady: boolean;
}) {
  const [draftState, draftAction, drafting] = useActionState(writeDraft, {});
  const [saveState, saveAction, saving] = useActionState(saveText, {});
  const [sendState, sendAction, sending] = useActionState(sendReportAction, {});
  const [reviewState, reviewAction, reviewing] = useActionState(reviewWithCustomer, {});
  const problems = draft?.ai_draft?.problems ?? [];
  // A submit button's name/value is not passed to a formAction, so each one sets its channel.
  const sendVia = (form: FormData, channel: "email" | "sms_device") => {
    form.set("channel", channel);
    sendAction(form);
  };
  const latestSent = sent.find((r) => r.status === "sent");
  // The draft (text boxes and sending) folds away. Folded on load when there is one already;
  // opened by Write Draft. Folding only hides it, so unsaved edits stay.
  const [open, setOpen] = useState(false);
  const bodyId = `report-${template}-draft`;

  return (
    <section
      aria-labelledby={`report-${template}`}
      className="card p-5"
      data-testid={`report-${template}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 id={`report-${template}`} className="font-display text-xl font-bold">
          {name}
        </h3>
        {draft?.final_sections ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen(!open)}
            className="inline-flex min-h-11 items-center gap-1 font-semibold text-link"
          >
            {open ? "Hide Draft" : "Show Draft"}
            <svg
              viewBox="0 0 24 24"
              className={cx("size-5 transition-transform", open && "rotate-180")}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        ) : null}
        {latestSent?.token ? (
          <a
            href={`/r/${latestSent.token}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center text-link underline"
          >
            View version {latestSent.version}
          </a>
        ) : null}
      </div>

      <form
        action={(form) => {
          setOpen(true);
          draftAction(form);
        }}
        className="mt-3 flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          // Writing again replaces the draft's text, edits included.
          if (
            draft?.final_sections &&
            !window.confirm(
              "Write the draft again? The new draft replaces this one, including your edits.",
            )
          )
            e.preventDefault();
        }}
      >
        <input type="hidden" name="job" value={jobId} />
        <input type="hidden" name="template" value={template} />
        <Button
          type="submit"
          kind={draft?.final_sections ? "secondary" : "primary"}
          disabled={drafting}
        >
          {drafting ? "Writing…" : draft?.final_sections ? "Write the Draft Again" : "Write Draft"}
        </Button>
      </form>
      <div className="mt-3">
        <Status state={draftState} />
      </div>

      {draft?.final_sections ? (
        <div id={bodyId} hidden={!open}>
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
          {/* One form: Save and Send both take the text on screen, so no edit is left behind. */}
          <form className="mt-4 space-y-4">
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
                  className="block w-full rounded-xl border border-control-border bg-surface px-3 py-2"
                />
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" formAction={saveAction} kind="secondary" disabled={saving}>
                {saving ? "Saving…" : "Save Text"}
              </Button>
              <span
                aria-live="polite"
                className={cx(
                  "text-[0.9375rem]",
                  saveState.error ? "text-status-fail" : "text-status-pass",
                )}
              >
                {saveState.error ?? saveState.message}
              </span>
            </div>

            <div className="mt-6 border-t border-border pt-4">
              <h4 className="font-medium">Finish version {draft.version}</h4>
              <p className="text-[0.9375rem] text-text-muted">
                Hand the phone to the customer: they read the report and sign at the bottom. Signing
                locks this version; changes after that go out as a new version.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button type="submit" formAction={reviewAction} disabled={reviewing}>
                  {reviewing ? "Opening…" : "Review with Customer"}
                </Button>
              </div>
              {reviewState.error ? (
                <div className="mt-3">
                  <Notice tone="error">{reviewState.error}</Notice>
                </div>
              ) : null}
              <details className="mt-4" data-testid="send-unsigned">
                <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-link">
                  Send Without a Signature
                </summary>
                <p className="text-[0.9375rem] text-text-muted">
                  Sending saves your edits and locks this version.
                </p>
                <SendControls
                  id={draft.id}
                  customerEmail={customerEmail}
                  emailReady={emailReady}
                  sending={sending}
                  sendVia={sendVia}
                />
              </details>
            </div>
          </form>
        </div>
      ) : null}
      {draft?.final_sections && !open ? (
        <p className="mt-2 text-[0.9375rem] text-text-muted">
          Draft version {draft.version} is ready to read, edit, and review with the customer.
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        <Status state={sendState} />
        {sendState.sms ? (
          <div className="space-y-2">
            <CopyLink
              url={sendState.sms}
              label="Message to text the customer"
              button="Copy Message"
            />
          </div>
        ) : null}
      </div>

      {latestSent ? (
        <form className="mt-6 border-t border-border pt-4" data-testid="finished-report">
          <input type="hidden" name="job" value={jobId} />
          <input type="hidden" name="report" value={latestSent.id} />
          <h4 className="font-medium">Version {latestSent.version} is finished</h4>
          <p className="text-[0.9375rem] text-text-muted">
            Send it to the customer, or download the PDF.
          </p>
          <SendControls
            id={latestSent.id}
            customerEmail={customerEmail}
            emailReady={emailReady}
            sending={sending}
            sendVia={sendVia}
            primary={!draft?.final_sections}
          />
          {latestSent.token ? (
            <a
              href={`/r/${latestSent.token}/pdf`}
              target="_blank"
              rel="noreferrer"
              className={buttonClass("quiet", "mt-2 -ml-3 px-3")}
            >
              Download PDF
            </a>
          ) : null}
        </form>
      ) : null}

      {sent.length ? (
        <div className="mt-6 border-t border-border pt-4">
          <h4 className="font-medium">Versions</h4>
          <ul className="mt-1 divide-y divide-border">
            {sent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 py-1">
                <span className="text-[0.9375rem]">
                  Version {r.version}
                  <span className="text-text-muted">
                    {" · "}
                    {r.sent_at
                      ? new Date(r.sent_at).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : ""}
                    {r.status === "superseded" ? " · replaced" : ""}
                  </span>
                </span>
                {r.token ? (
                  <span className="flex gap-1">
                    <a
                      href={`/r/${r.token}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Version ${r.version} report`}
                      className={buttonClass("quiet", "px-3 text-[0.9375rem]")}
                    >
                      Report
                    </a>
                    <a
                      href={`/r/${r.token}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Version ${r.version} PDF`}
                      className={buttonClass("quiet", "px-3 text-[0.9375rem]")}
                    >
                      PDF
                    </a>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** Email or text one report; used for the draft (unsigned) and for a finished version. */
function SendControls({
  id,
  customerEmail,
  emailReady,
  sending,
  sendVia,
  primary = false,
}: {
  id: string;
  customerEmail: string | null;
  emailReady: boolean;
  sending: boolean;
  sendVia: (form: FormData, channel: "email" | "sms_device") => void;
  primary?: boolean;
}) {
  return (
    <>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1 space-y-1">
          <label htmlFor={`${id}-to`} className="block font-medium">
            Customer email
          </label>
          <input
            id={`${id}-to`}
            name="to"
            type="email"
            defaultValue={customerEmail ?? ""}
            className="block min-h-11 w-full rounded-xl border border-control-border bg-surface px-3"
          />
        </div>
        <Button
          type="submit"
          kind={primary ? "primary" : "secondary"}
          formAction={(f) => sendVia(f, "email")}
          disabled={sending || !emailReady}
          title={emailReady ? undefined : "Email isn’t set up yet"}
        >
          {sending ? "Sending…" : "Send by Email"}
        </Button>
        <Button
          type="submit"
          formAction={(f) => sendVia(f, "sms_device")}
          kind="secondary"
          disabled={sending}
        >
          Send by Text
        </Button>
      </div>
      {!emailReady ? (
        <p className="mt-2 text-[0.9375rem] text-text-muted">
          Email isn’t set up yet. “Send by Text” gives you a link and message to text the customer.
        </p>
      ) : null}
    </>
  );
}
