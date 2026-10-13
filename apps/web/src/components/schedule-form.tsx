"use client";

import { useActionState } from "react";
import { scheduleJob } from "@/app/actions/jobs";
import { Button, Field, Notice, Select } from "./ui";

/** Assign a tech and a time. Repairs from accepted quotes start here. */
export function ScheduleForm({
  jobId,
  techs,
  defaults,
}: {
  jobId: string;
  techs: { value: string; label: string }[];
  defaults: { tech: string; date: string; time: string; hours: string };
}) {
  const [state, action, pending] = useActionState(scheduleJob, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="job" value={jobId} />
      <Select
        label="Tech"
        name="tech"
        defaultValue={defaults.tech}
        options={[{ value: "", label: "Nobody yet" }, ...techs]}
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
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <div className="flex items-center gap-3">
        <Button type="submit" kind="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save Schedule"}
        </Button>
        <span role="status" className="text-[15px] text-status-pass">
          {state.message}
        </span>
      </div>
    </form>
  );
}
