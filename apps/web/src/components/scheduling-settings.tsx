"use client";

import { useState, useTransition } from "react";
import { saveScheduling, type RouteResult } from "@/app/actions/routes";
import { Segmented } from "./segmented";
import { FieldError, SField, SettingsForm } from "./settings-forms";
import { Button } from "./ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Settings › Scheduling: the working day routes are planned in, and arrival windows. */
export function SchedulingForm({
  defaults,
}: {
  defaults: {
    dayStart: string;
    dayEnd: string;
    windowMin: number;
    jobHours: string;
    workDays: number[];
    visitMinutes: number;
    weeksAhead: number;
  };
}) {
  const [window, setWindow] = useState(String(defaults.windowMin) as "0" | "60" | "120" | "240");
  return (
    <SettingsForm action={saveScheduling} primary>
      <div className="grid gap-4 sm:grid-cols-3">
        <SField label="Day starts" name="day_start" type="time" defaultValue={defaults.dayStart} />
        <SField
          label="Back at the shop by"
          name="day_end"
          type="time"
          defaultValue={defaults.dayEnd}
        />
        <SField
          label="Usual job length (hours)"
          name="job_hours"
          inputMode="decimal"
          defaultValue={defaults.jobHours}
          hint="For jobs booked without an end time."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SField
          label="Maintenance visit (minutes)"
          name="visit_minutes"
          inputMode="numeric"
          defaultValue={String(defaults.visitMinutes)}
          hint="For new maintenance plans."
        />
        <SField
          label="Schedule maintenance ahead (weeks)"
          name="weeks_ahead"
          inputMode="numeric"
          defaultValue={String(defaults.weeksAhead)}
          hint="How far ahead plans put visits on the schedule."
        />
      </div>
      <fieldset>
        <legend className="font-medium">Working days</legend>
        <p className="text-[15px] text-text-muted">Suggested times use these days.</p>
        <div className="mt-1 flex flex-wrap gap-x-4">
          {DAYS.map((d, i) => (
            <label key={d} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                name="work_days"
                value={i}
                defaultChecked={defaults.workDays.includes(i)}
                aria-label={DAY_NAMES[i]}
                className="size-5 accent-water"
              />
              <span aria-hidden="true">{d}</span>
            </label>
          ))}
        </div>
        <FieldError name="work_days" />
      </fieldset>
      <div>
        <Segmented
          label="Arrival time customers are told"
          name="arrival_window_minutes"
          value={window}
          onChange={setWindow}
          options={[
            { value: "0", label: "Exact Time" },
            { value: "60", label: "1-Hour Window" },
            { value: "120", label: "2-Hour Window" },
            { value: "240", label: "4-Hour Window" },
          ]}
        />
        <p className="mt-1 text-[15px] text-text-muted">
          {window === "0"
            ? "On My Way texts say “about 10:15 AM”."
            : `On My Way texts give a ${Number(window) / 60}-hour window, like “between 10:00 AM and ${
                window === "60" ? "11:00 AM" : window === "120" ? "12:00 PM" : "2:00 PM"
              }”.`}
        </p>
      </div>
    </SettingsForm>
  );
}

/** A button that runs a server action and shows what happened. */
export function ActionButton({
  action,
  label,
  busyLabel,
}: {
  action: () => Promise<RouteResult>;
  label: string;
  busyLabel: string;
}) {
  const [result, setResult] = useState<RouteResult>({});
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button
        type="button"
        kind="secondary"
        disabled={pending}
        onClick={() => start(async () => setResult(await action()))}
      >
        {pending ? busyLabel : label}
      </Button>
      <span role="status" className="text-[15px]">
        {result.error ? (
          <span className="text-status-fail">{result.error}</span>
        ) : (
          <span className="text-status-pass">{result.message}</span>
        )}
      </span>
    </span>
  );
}
