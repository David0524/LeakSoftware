"use client";

import { useState, useTransition } from "react";
import { CLEANING_MONTHS, cleaningMonthsLabel } from "@leakbook/core";
import { saveCleaningDefaults } from "@/app/actions/maintenance";
import { saveScheduling, type RouteResult } from "@/app/actions/routes";
import { Segmented } from "./segmented";
import { FieldError, SField, SSwitch, SettingsFields, SettingsForm } from "./settings-forms";
import { Button, GROUP_ROW, cx } from "./ui";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Settings › Scheduling: the working day routes are planned in, and arrival windows. */
export function SchedulingForm({
  defaults,
  pool = true,
}: {
  /** The shop does pool care: show the maintenance plan settings. */
  pool?: boolean;
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
    <SettingsForm action={saveScheduling} primary full>
      <SettingsFields labelWidth="9.5rem" className="sm:grid sm:grid-cols-3 sm:gap-4">
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
          required
        />
      </SettingsFields>
      {pool ? (
        <SettingsFields labelWidth="9.5rem" className="sm:grid sm:grid-cols-2 sm:gap-4">
          <SField
            label="Maintenance visit (minutes)"
            name="visit_minutes"
            inputMode="numeric"
            defaultValue={String(defaults.visitMinutes)}
            hint="For new maintenance plans."
            required
          />
          <SField
            label="Schedule maintenance ahead (weeks)"
            name="weeks_ahead"
            inputMode="numeric"
            defaultValue={String(defaults.weeksAhead)}
            stacked
            required
          />
        </SettingsFields>
      ) : (
        // Leak detection only: the maintenance settings keep their values.
        <>
          <input type="hidden" name="visit_minutes" value={defaults.visitMinutes} />
          <input type="hidden" name="weeks_ahead" value={defaults.weeksAhead} />
        </>
      )}
      <SettingsFields>
        <fieldset className={cx(GROUP_ROW, "max-sm:py-2.5")}>
          <legend className="sm:font-medium">Working days</legend>
          <p className="text-[0.9375rem] text-text-muted">Suggested times use these days.</p>
          {/* Each day is a round toggle, filled when it's a working day. */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => (
              <label key={d} className="cursor-pointer">
                <input
                  type="checkbox"
                  name="work_days"
                  value={i}
                  defaultChecked={defaults.workDays.includes(i)}
                  aria-label={DAY_NAMES[i]}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className="grid size-11 place-items-center rounded-full bg-fill text-[0.9375rem] font-medium transition-colors peer-checked:bg-link peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
                >
                  {d}
                </span>
              </label>
            ))}
          </div>
          <FieldError name="work_days" />
        </fieldset>
      </SettingsFields>
      <div>
        <Segmented
          label="Arrival time customers are told"
          name="arrival_window_minutes"
          value={window}
          onChange={setWindow}
          options={[
            { value: "0", label: "Exact" },
            { value: "60", label: "1 Hour" },
            { value: "120", label: "2 Hours" },
            { value: "240", label: "4 Hours" },
          ]}
        />
        <p className="mt-1 px-4 text-[0.9375rem] text-text-muted sm:px-0">
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
        onClick={() =>
          start(async () => setResult(await whenOffline(action(), { error: NO_CONNECTION })))
        }
      >
        {pending ? busyLabel : label}
      </Button>
      <span role="status" className="text-[0.9375rem]">
        {result.error ? (
          <span className="text-status-fail">{result.error}</span>
        ) : (
          <span className="text-status-pass">{result.message}</span>
        )}
      </span>
    </span>
  );
}

/**
 * Settings › Scheduling › Regular cleanings (owner, 2026-10-19): how often the shop usually
 * cleans filters and salt cells. New plans start with it; existing plans change only when
 * asked.
 */
export function CleaningDefaultsForm({
  types,
}: {
  types: { key: string; name: string; months: number }[];
}) {
  const [months, setMonths] = useState<Record<string, string>>(
    Object.fromEntries(types.map((t) => [t.key, String(t.months)])),
  );
  return (
    <SettingsForm action={saveCleaningDefaults} full>
      {types.map((t) => (
        <div key={t.key} className="space-y-1">
          <input type="hidden" name="cleaning_key" value={t.key} />
          <Segmented
            label={t.name}
            name={`months_${t.key}`}
            value={months[t.key] ?? "3"}
            onChange={(v) => setMonths({ ...months, [t.key]: v })}
            fit
            options={CLEANING_MONTHS.map((m) => ({
              value: String(m),
              label: cleaningMonthsLabel(m),
            }))}
          />
          <FieldError name={`months_${t.key}`} />
        </div>
      ))}
      <SSwitch
        label="Also change existing plans"
        name="apply_existing"
        hint="Off: only new plans use these. On: every plan's cleaning changes to match; each keeps its next due date."
      />
    </SettingsForm>
  );
}
