"use client";

import { useActionState, useState, useTransition } from "react";
import { scheduleJob } from "@/app/actions/jobs";
import { moveJob, type RouteResult } from "@/app/actions/routes";
import { Suggestions } from "./route-board";
import { Button, Checkbox, Field, Notice, Select } from "./ui";

/**
 * Assign a tech and a time. Repairs from accepted quotes start here. Suggest Times fits the
 * job into the routes already planned; picking one schedules it there.
 */
export function ScheduleForm({
  jobId,
  techs,
  defaults,
  canSuggest = true,
  allowNobody = true,
}: {
  jobId: string;
  techs: { value: string; label: string }[];
  defaults: { tech: string; date: string; time: string; hours: string; fixed?: boolean };
  canSuggest?: boolean;
  /** False for a tech who sees only their own jobs: unassigning would hide it from them. */
  allowNobody?: boolean;
}) {
  const [state, action, pending] = useActionState(scheduleJob, {});
  const [picked, setPicked] = useState<RouteResult>({});
  const [placing, start] = useTransition();
  return (
    <div className="space-y-4">
      {canSuggest ? (
        <div>
          <Suggestions
            target={{ job: jobId }}
            onPick={(s) =>
              start(async () =>
                setPicked(
                  await moveJob({ job: jobId, tech: s.techId, date: s.date, index: s.position }),
                ),
              )
            }
          />
          {placing ? <p role="status">Scheduling…</p> : null}
          {picked.error ? <Notice tone="error">{picked.error}</Notice> : null}
          {picked.message ? <Notice tone="success">{picked.message}</Notice> : null}
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
        <div className="grid gap-3 sm:grid-cols-3">
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
        <Checkbox
          name="fixed"
          label="The customer was told this time (planning won’t move it)"
          defaultChecked={defaults.fixed}
        />
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
