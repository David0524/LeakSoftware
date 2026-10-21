"use client";

import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { scheduleJob } from "@/app/actions/jobs";
import { moveJob, type RouteResult } from "@/app/actions/routes";
import { Suggestions } from "./route-board";
import { Sheet } from "./sheet";
import { JOB_LOCKS, JOB_LOCK_HELP, JOB_LOCK_LABELS, type JobLock } from "@leakbook/core";
import { LockIcon } from "./icons";
import { Segmented } from "./segmented";
import { Button, Field, Notice, Select } from "./ui";
import { NO_CONNECTION, orOffline, whenOffline } from "@/lib/offline";

type ScheduleFormProps = Parameters<typeof ScheduleForm>[0];

/**
 * The job's schedule as an iOS grouped list (tech, when), with the form in a sheet: Change
 * Schedule opens it, and saving closes it and says so under the list.
 */
export function JobSchedule({
  tech,
  when,
  lock,
  ...form
}: Omit<ScheduleFormProps, "onSaved"> & {
  /** Already formatted on the server. */
  tech: string;
  when: string | null;
  lock: JobLock;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const row = "flex min-h-11 items-center gap-3 px-4 py-2.5";
  return (
    <div>
      <ul className="grouped">
        <li className={row}>
          <span className="flex-1">Tech</span>
          <span className="text-right text-text-muted">{tech}</span>
        </li>
        <li className={row}>
          <span className="flex-1">When</span>
          <span className="text-right text-text-muted">{when ?? "Not scheduled"}</span>
        </li>
        {JOB_LOCK_LABELS[lock].tag ? (
          <li className={row}>
            <span className="flex-1">Lock</span>
            <span className="inline-flex items-center gap-1.5 text-right text-text-muted">
              <LockIcon className="size-4" />
              {JOB_LOCK_LABELS[lock].tag}
            </span>
          </li>
        ) : null}
        <li>
          <button
            type="button"
            onClick={() => {
              setDone(null);
              setOpen(true);
            }}
            className={`${row} w-full text-left text-link hover:bg-text/[0.03] active:bg-text/[0.06]`}
          >
            {when ? "Change Schedule" : "Schedule Job"}
          </button>
        </li>
      </ul>
      {done ? (
        <p role="status" className="mt-2 px-4 text-[0.9375rem] text-status-pass">
          {done}
        </p>
      ) : null}
      <Sheet open={open} onClose={close} title="Schedule">
        <ScheduleForm
          {...form}
          onSaved={(message) => {
            setDone(message);
            close();
          }}
        />
      </Sheet>
    </div>
  );
}

/**
 * Assign a tech and a time. Repairs from accepted quotes start here. Suggest Times fits the
 * job into the routes already planned; picking one schedules it there.
 */
function ScheduleForm({
  jobId,
  techs,
  defaults,
  canSuggest = true,
  allowNobody = true,
  onSaved,
}: {
  jobId: string;
  techs: { value: string; label: string }[];
  defaults: { tech: string; date: string; time: string; hours: string; lock?: JobLock };
  canSuggest?: boolean;
  /** False for a tech who sees only their own jobs: unassigning would hide it from them. */
  allowNobody?: boolean;
  /** Called with the confirmation after a save or a picked suggestion, e.g. to close a sheet. */
  onSaved?: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(orOffline(scheduleJob), {});
  const [picked, setPicked] = useState<RouteResult>({});
  const [placing, start] = useTransition();
  const [lock, setLock] = useState<JobLock>(defaults.lock ?? "none");
  const saved = useRef(onSaved);
  useEffect(() => {
    saved.current = onSaved;
  });
  useEffect(() => {
    if (state.message && !state.error) saved.current?.(state.message);
  }, [state]);
  useEffect(() => {
    if (picked.message && !picked.error)
      saved.current?.([picked.message, picked.detail].filter(Boolean).join(" "));
  }, [picked]);
  return (
    <div className="space-y-4">
      {canSuggest ? (
        <div>
          <Suggestions
            target={{ job: jobId }}
            onPick={(s) =>
              start(async () =>
                setPicked(
                  await whenOffline(
                    moveJob({ job: jobId, tech: s.techId, date: s.date, index: s.position }),
                    { error: NO_CONNECTION },
                  ),
                ),
              )
            }
          />
          {placing ? <p role="status">Scheduling…</p> : null}
          {picked.error ? <Notice tone="error">{picked.error}</Notice> : null}
          {picked.message ? (
            <Notice tone="success">
              {picked.message}
              {picked.detail ? ` ${picked.detail}` : ""}
            </Notice>
          ) : null}
        </div>
      ) : null}
      <form action={action} className="space-y-3">
        <input type="hidden" name="job" value={jobId} />
        <Select
          label="Tech"
          name="tech"
          defaultValue={defaults.tech}
          options={allowNobody ? [{ value: "", label: "Nobody yet" }, ...techs] : techs}
        />
        {/* Date, start, and hours on one row, phones included. */}
        <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1.15fr)_minmax(0,0.6fr)] gap-2 sm:gap-4 [&>*]:min-w-0">
          <Field
            label="Date"
            name="date"
            type="date"
            defaultValue={defaults.date}
            error={state.fields?.date}
          />
          <Field
            label="Start"
            name="time"
            type="time"
            defaultValue={defaults.time}
            error={state.fields?.time}
          />
          <Field
            label="Hours"
            name="hours"
            inputMode="decimal"
            defaultValue={defaults.hours}
            error={state.fields?.hours}
          />
        </div>
        {/* Locks (owner, 2026-10-20): what Optimize and Plan Week leave alone. */}
        <div>
          <Segmented
            label="Lock"
            name="lock"
            value={lock}
            options={JOB_LOCKS.map((l) => ({ value: l, label: JOB_LOCK_LABELS[l].segment }))}
            onChange={setLock}
            fit
            segmentClassName="min-h-11"
          />
          <p id="lock-help" aria-live="polite" className="mt-1.5 text-[0.9375rem] text-text-muted">
            {JOB_LOCK_HELP[lock]}
          </p>
        </div>
        {state.error ? <Notice tone="error">{state.error}</Notice> : null}
        <div className="flex items-center gap-3">
          <Button type="submit" kind="secondary" disabled={pending}>
            {pending ? "Saving…" : "Save Schedule"}
          </Button>
          <span role="status" className="text-[0.9375rem] text-status-pass">
            {state.message}
          </span>
        </div>
      </form>
    </div>
  );
}
