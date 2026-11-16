"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ISSUE_TEXT,
  friendlyError,
  issueDescriptionError,
  issueWorkOptions,
  type IssueWork,
  type Services,
} from "@leakbook/core";
import {
  announceIssue,
  convertIssue,
  reopenIssue,
  reportIssue,
  resolveIssue,
} from "@/app/actions/issues";
import { ErrorText, useRun } from "./job-work";
import { uploadIssueFiles } from "./media-work";
import { Segmented } from "./segmented";
import { Sheet } from "./sheet";
import { Button, ButtonLink, TextArea, cx } from "./ui";

// Service issues on the website (docs/design/2026-11-16-service-issues.md): Report an Issue on a
// job, and the office's actions on an issue's page. The same words as the apps (core ISSUE_TEXT).

type Work = IssueWork | "";

/**
 * The job page's Report an Issue row (in its Issues group) and its sheet: what's wrong, photos and
 * videos, Suggested Work, then Report. The issue is saved first, then its files go up.
 */
export function ReportIssue({ jobId, services }: { jobId: string; services: Services }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [work, setWork] = useState<Work>("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const previews = useObjectUrls(files);

  function reset() {
    setDescription("");
    setWork("");
    setFiles([]);
    setError(null);
  }

  async function submit() {
    const problem = issueDescriptionError(description);
    if (problem) return setError(problem);
    setError(null);
    setBusy("Reporting…");
    try {
      const form = new FormData();
      form.set("job", jobId);
      form.set("description", description);
      form.set("suggested", work);
      const saved = await reportIssue({}, form);
      const failed = saved.error ?? Object.values(saved.fields ?? {})[0];
      if (failed || !saved.message) throw new Error(failed ?? "Couldn’t report the issue.");
      const issueId = saved.message;
      try {
        if (files.length) await uploadIssueFiles(jobId, issueId, files, setBusy);
      } finally {
        // The issue is saved either way: the office hears about it.
        const announce = new FormData();
        announce.set("issue", issueId);
        await announceIssue({}, announce);
      }
      reset();
      setOpen(false);
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  const add = (list: FileList | null) => {
    const picked = [...(list ?? [])];
    if (picked.length) setFiles((f) => [...f, ...picked]);
  };

  return (
    <>
      <li>
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setOpen(true);
          }}
          className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left font-semibold text-link hover:bg-text/[0.03] active:bg-text/[0.06]"
        >
          {ISSUE_TEXT.report}
        </button>
        {done ? (
          <p aria-live="polite" className="px-4 pb-2.5 text-[0.9375rem] text-status-pass">
            {ISSUE_TEXT.reported}
          </p>
        ) : null}
      </li>
      <Sheet open={open} onClose={() => !busy && setOpen(false)} title={ISSUE_TEXT.sheetTitle}>
        <div className="space-y-5">
          <TextArea
            label={ISSUE_TEXT.whatsWrong}
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={ISSUE_TEXT.placeholder}
            maxLength={2000}
            autoFocus
          />
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className={TILE}>
                Add Photo or Video
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/*,video/*"
                  capture="environment"
                  className="sr-only"
                  disabled={!!busy}
                  onChange={(e) => {
                    add(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className={TILE}>
                Library
                <input
                  ref={libraryInput}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="sr-only"
                  disabled={!!busy}
                  onChange={(e) => {
                    add(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {files.length ? (
              <ul className="grid grid-cols-4 gap-2" aria-label="Photos and videos to add">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="relative">
                    {f.type.startsWith("video/") ? (
                      <video
                        src={previews[i]}
                        muted
                        className="aspect-square w-full rounded-xl bg-text/10 object-cover"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previews[i]}
                        alt=""
                        className="aspect-square w-full rounded-xl bg-text/10 object-cover"
                      />
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${f.type.startsWith("video/") ? "video" : "photo"} ${i + 1}`}
                      onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}
                      className="absolute -top-2 -right-2 flex size-11 items-center justify-center"
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-6 items-center justify-center rounded-full bg-text/70 text-sm leading-none text-surface"
                      >
                        ×
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <Segmented<Work>
            label={ISSUE_TEXT.suggestedWork}
            name="suggested"
            value={work}
            options={issueWorkOptions(services).map((o) => ({
              value: o.value ?? "",
              label: o.label,
            }))}
            onChange={setWork}
          />
          <div className="space-y-2">
            <Button
              type="button"
              className="w-full"
              disabled={!!busy}
              onClick={() => void submit()}
            >
              {busy ?? ISSUE_TEXT.submit}
            </Button>
            <ErrorText error={error} />
          </div>
        </div>
      </Sheet>
    </>
  );
}

const TILE = cx(
  "flex min-h-14 cursor-pointer items-center justify-center rounded-2xl bg-link/10 px-2 py-1.5 text-center",
  "text-[0.9375rem] leading-tight font-semibold text-link hover:bg-link/20 focus-within:outline-3",
);

/** Preview links for picked files, freed when they change. */
function useObjectUrls(files: File[]): string[] {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

/**
 * An issue's actions on its page: Make Quote (a repair job, opened at its Wrap-Up to build the
 * quote), Make Leak Detection Job, Resolve (with a note), Reopen, or Open Job once it's a job.
 */
export function IssueActions({
  issueId,
  actions,
  madeJobId,
}: {
  issueId: string;
  actions: ("make_quote" | "make_detection" | "resolve" | "reopen" | "open_job")[];
  madeJobId: string | null;
}) {
  const router = useRouter();
  const { pending, error, call } = useRun();
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  const convert = (type: IssueWork) =>
    void call(convertIssue, { issue: issueId, type }, undefined, (r) => {
      if (r.message)
        router.push(type === "repair" ? `/jobs/${r.message}?tab=wrap-up` : `/jobs/${r.message}`);
    });

  if (actions.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {actions.includes("open_job") && madeJobId ? (
          <ButtonLink href={`/jobs/${madeJobId}`}>{ISSUE_TEXT.openJob}</ButtonLink>
        ) : null}
        {actions.includes("make_quote") ? (
          <Button type="button" disabled={pending} onClick={() => convert("repair")}>
            {ISSUE_TEXT.makeQuote}
          </Button>
        ) : null}
        {actions.includes("make_detection") ? (
          <Button
            type="button"
            kind="secondary"
            disabled={pending}
            onClick={() => convert("detection")}
          >
            {ISSUE_TEXT.makeDetection}
          </Button>
        ) : null}
        {actions.includes("resolve") ? (
          <Button
            type="button"
            kind="secondary"
            disabled={pending}
            onClick={() => setResolving(true)}
          >
            {ISSUE_TEXT.resolve}
          </Button>
        ) : null}
        {actions.includes("reopen") ? (
          <Button
            type="button"
            kind="secondary"
            disabled={pending}
            onClick={() =>
              void call(reopenIssue, { issue: issueId }, undefined, () => router.refresh())
            }
          >
            {ISSUE_TEXT.reopen}
          </Button>
        ) : null}
      </div>
      <ErrorText error={error} />
      <Sheet open={resolving} onClose={() => setResolving(false)} title={ISSUE_TEXT.resolveTitle}>
        <div className="space-y-4">
          <TextArea
            label={ISSUE_TEXT.resolveNote}
            name="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={ISSUE_TEXT.resolveNotePlaceholder}
            maxLength={1000}
          />
          <Button
            type="button"
            className="w-full"
            disabled={pending}
            onClick={() =>
              void call(resolveIssue, { issue: issueId, note }, undefined, (r) => {
                const failed = r.error ?? r.fields?.note ?? null;
                setNoteError(failed);
                if (!failed) {
                  setResolving(false);
                  setNote("");
                  router.refresh();
                }
              })
            }
          >
            {ISSUE_TEXT.resolve}
          </Button>
          <ErrorText error={noteError} />
        </div>
      </Sheet>
    </div>
  );
}
