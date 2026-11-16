"use client";

import { useCallback, useRef, useState } from "react";
import {
  SKIP_BANNER,
  SKIP_DISMISS_LABEL,
  SKIP_NOTE_MAX,
  SKIP_REASON_REQUIRED,
  SKIP_RESCHEDULE_LABEL,
  SKIP_TEXT_LABEL,
  SKIP_UNDO_LABEL,
  REMOVED_UNDO_SECONDS,
  friendlyError,
  skipCustomerText,
  type SkipReason,
} from "@leakbook/core";
import { changeJobStatus } from "@/app/actions/inspection";
import { dismissSkip, skipVisit } from "@/app/actions/skip";
import { orOffline } from "@/lib/offline";
import { CameraIcon, CheckIcon } from "./icons";
import { useSetJobStatus } from "./instant";
import { useRun } from "./job-work";
import { uploadJobPhotos } from "./media-work";
import { smsHref } from "./on-my-way";
import { Sheet } from "./sheet";
import { requestReschedule, useSkipVisitRequest } from "./skip-events";
import { showBanner } from "./top-banner";
import { Button, buttonClass, cx } from "./ui";

/**
 * Skip Visit (owner, 2026-11-16; docs/design/2026-11-16-skip-visit.md): a sheet to pick why
 * (required, from Settings › Skip Reasons), add a note and a photo, then Skip. The visit shows
 * as skipped at once, with Undo for five seconds; a customer with a phone number is offered
 * "Text the Customer" next, in the tech's own Messages (as On My Way does).
 */
export function SkipVisit({
  jobId,
  reasons,
  customer,
  phone,
  tech,
  shop,
}: {
  jobId: string;
  reasons: Pick<SkipReason, "id" | "label">[];
  customer: string | null;
  phone: string | null;
  tech: string;
  shop: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const { pending, call } = useRun();
  const setStatus = useSetJobStatus();
  const picker = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useSkipVisitRequest(() => {
    setReason("");
    setNote("");
    setPhotos([]);
    setError(null);
    setOpen(true);
  });

  async function submit() {
    if (!reason) {
      setError(SKIP_REASON_REQUIRED);
      return;
    }
    setError(null);
    const result = await call(skipVisit, { job: jobId, reason, note }, () =>
      setStatus(jobId, "skipped"),
    );
    const failed = result.error ?? Object.values(result.fields ?? {})[0];
    if (failed) {
      setError(failed);
      return;
    }
    close();
    // The photo goes up after the skip is saved; a failed upload is said, not lost silently.
    const uploading = photos.length
      ? uploadJobPhotos(jobId, photos).catch((e: unknown) =>
          showBanner({ tone: "error", message: friendlyError(e) }),
        )
      : Promise.resolve();
    showBanner({
      message: SKIP_BANNER,
      ms: REMOVED_UNDO_SECONDS * 1000,
      action: {
        label: SKIP_UNDO_LABEL,
        onAction: () => {
          void orOffline(changeJobStatus)({}, formOf({ job: jobId, to: "scheduled" })).then((r) => {
            if (r.error) showBanner({ tone: "error", message: r.error });
          });
        },
      },
    });
    await uploading;
    if (phone) setText(skipCustomerText({ customer, tech, shop, reason }));
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={close}
        title="Skip Visit"
        done={{
          label: pending ? "Skipping…" : "Skip",
          onClick: () => void submit(),
          disabled: pending,
        }}
      >
        <div className="space-y-4">
          <section aria-labelledby="skip-why">
            <h3
              id="skip-why"
              className="mb-2 font-sans text-[0.8125rem] font-normal text-text-muted uppercase"
            >
              Reason
            </h3>
            <ul className="grouped" role="radiogroup" aria-labelledby="skip-why">
              {reasons.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={reason === r.label}
                    onClick={() => {
                      setReason(r.label);
                      setError(null);
                    }}
                    className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-text/[0.03] active:bg-text/[0.06]"
                  >
                    <span className="flex-1">{r.label}</span>
                    {reason === r.label ? <CheckIcon className="size-5 text-link" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <div className="space-y-1">
            <label htmlFor="skip-note" className="block font-medium">
              Note
            </label>
            <textarea
              id="skip-note"
              value={note}
              maxLength={SKIP_NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Optional"
              className="block w-full rounded-[10px] border border-control-border bg-surface p-3 text-[1.0625rem] text-text placeholder:text-placeholder"
            />
          </div>
          <div className="space-y-2">
            <input
              ref={picker}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                if (files.length) setPhotos((p) => [...p, ...files]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => picker.current?.click()}
              className={cx(buttonClass("secondary"), "gap-2")}
            >
              <CameraIcon className="size-5" />
              Add Photo
            </button>
            {photos.length ? (
              <p className="text-[0.9375rem] text-text-muted">
                {photos.length === 1 ? "1 photo" : `${photos.length} photos`} will be added to the
                visit.
              </p>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-[0.9375rem] text-status-fail">
              {error}
            </p>
          ) : null}
        </div>
      </Sheet>
      <Sheet
        open={text !== null}
        onClose={() => setText(null)}
        title={`${SKIP_TEXT_LABEL}?`}
        cancelLabel="Not Now"
      >
        <div className="space-y-3">
          <label htmlFor="skip-text" className="sr-only">
            Message to {customer ?? "the customer"}
          </label>
          <textarea
            id="skip-text"
            value={text ?? ""}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="block w-full rounded-[10px] border border-control-border bg-surface p-3 text-[1.0625rem] text-text"
          />
          <p className="text-[0.9375rem] text-text-muted">Opens Messages on this device.</p>
          {phone ? (
            <a
              href={smsHref(phone, text ?? "")}
              onClick={() => setText(null)}
              className={cx(buttonClass("primary"), "w-full")}
            >
              {SKIP_TEXT_LABEL}
            </a>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}

function formOf(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

/**
 * The skipped visit's actions for the office (owners and admins): Reschedule opens the
 * schedule sheet (Suggest Times and Move), Dismiss keeps it skipped and marks it handled.
 * Undo Skip is the job's own button.
 */
export function SkippedActions({
  jobId,
  reschedule,
  dismiss,
}: {
  jobId: string;
  reschedule: boolean;
  dismiss: boolean;
}) {
  const { pending, error, call } = useRun();
  if (!reschedule && !dismiss) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {reschedule ? (
          <Button type="button" onClick={requestReschedule}>
            {SKIP_RESCHEDULE_LABEL}
          </Button>
        ) : null}
        {dismiss ? (
          <Button
            type="button"
            kind="secondary"
            disabled={pending}
            onClick={() => void call(dismissSkip, { job: jobId })}
          >
            {SKIP_DISMISS_LABEL}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-[0.9375rem] text-status-fail">
          {error}
        </p>
      ) : null}
    </div>
  );
}
