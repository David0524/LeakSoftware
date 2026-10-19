"use client";

import { useActionState, useEffect, useId, useState, type ComponentProps } from "react";
import { submitReadings } from "@/app/actions/chemicals";
import {
  ACID_PRODUCTS,
  calculateChemistry,
  doseSummary,
  CHLORINE_PRODUCTS,
  type AcidProduct,
  type ChemistryResult,
  type ChlorineProduct,
  type ReadingKey,
  type Readings,
  targets,
} from "@leakbook/core";
import { Sheet } from "./sheet";
import { Button, cx, Notice, Select } from "./ui";

// The pool chemical calculator (owner, 2026-10-16). Live: every change recalculates. Opened for
// a pool, Submit saves the left side (gallons, readings, products) to the pool's chemical log
// (owner, 2026-10-19). The math is packages/core/src/chemistry.ts.

const num = (v: string) => {
  const n = Number(v.replace(/,/g, ""));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

const READINGS: { key: keyof Readings; label: string; hint: string; step: string }[] = [
  { key: "fc", label: "Free Chlorine", hint: "ppm", step: "0.5" },
  { key: "ph", label: "pH", hint: "", step: "0.1" },
  { key: "ta", label: "Alkalinity", hint: "ppm", step: "10" },
  { key: "ch", label: "Calcium", hint: "ppm", step: "25" },
  { key: "cya", label: "Stabilizer (CYA)", hint: "ppm", step: "10" },
  // Every pool gets the same readings and targets; salt is left blank on a chlorine pool
  // (owner, 2026-10-18).
  { key: "salt", label: "Salt", hint: "ppm", step: "100" },
];

/**
 * A number box with its label above and its unit inside, outlined at every width. The
 * calculator is all number entry, often on a phone at the pool, so every box must be plain to
 * see (owner, 2026-10-16: "I can't see the text boxes").
 */
function NumField({
  label,
  unit,
  className,
  ...input
}: ComponentProps<"input"> & { label: string; unit?: string }) {
  const id = useId();
  return (
    <div className={cx("min-w-0", className)}>
      <label htmlFor={id} className="mb-1 block font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          {...input}
          id={id}
          type="text"
          autoComplete="off"
          aria-describedby={unit ? `${id}-unit` : undefined}
          className={cx(
            "block min-h-11 w-full rounded-[10px] border border-control-border bg-surface px-3 py-2 text-text tabular-nums",
            "placeholder:text-placeholder focus:outline-3 focus:outline-offset-1 focus:outline-focus",
            unit && "pr-16",
          )}
        />
        {unit ? (
          <span
            id={`${id}-unit`}
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[0.9375rem] text-text-muted"
          >
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A small number box in the readings table, named by its row and column for screen readers. */
function CellInput({ label, ...input }: ComponentProps<"input"> & { label: string }) {
  return (
    <input
      {...input}
      type="text"
      autoComplete="off"
      aria-label={label}
      className={cx(
        "block min-h-11 w-full min-w-0 rounded-[10px] border border-control-border bg-surface px-3 py-2 text-right text-text tabular-nums",
        "placeholder:text-placeholder focus:outline-3 focus:outline-offset-1 focus:outline-focus",
      )}
    />
  );
}

/** Where a tech's chosen levels are remembered on this device (per person, not per shop). */
const GOALS_KEY = "tidemark:chemical-goals";

/** Gallons with thousands commas as they're typed: "20000" shows as "20,000". */
function withCommas(text: string): string {
  const digits = text
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, 7);
  return digits ? Number(digits).toLocaleString("en-US") : "";
}

/** The readings as pills, the steps in order, and the saturation index. */
function Doses({ result }: { result: ChemistryResult }) {
  return (
    <>
      <ul className="flex flex-wrap gap-2" aria-label="Readings">
        {result.statuses.map((s) => (
          <li
            key={s.key}
            className={cx(
              "rounded-full px-3 py-1 text-[0.9375rem] font-semibold",
              // On white with a colored outline: a tinted fill on the sheet's gray left the
              // green at 3.96:1 (design review 2026-10-16); on white it is 5:1.
              "bg-surface ring-1",
              s.status === "ok"
                ? "text-status-pass ring-status-pass/40"
                : "text-status-warning ring-status-warning/40",
            )}
          >
            {s.label} {s.key === "ph" ? s.value.toFixed(1) : s.value}
            <span className="font-normal">
              {" "}
              · {s.status === "ok" ? "OK" : s.status === "low" ? "Low" : "High"}
            </span>
          </li>
        ))}
      </ul>
      {result.steps.length === 0 ? (
        <p className="mt-4 font-semibold text-status-pass">Balanced. Nothing to add.</p>
      ) : (
        <ol className="mt-4 space-y-3" data-testid="doses">
          {result.steps.map((s, i) => (
            <li key={s.key + s.product} className="well flex gap-3 p-4">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary font-display font-bold text-on-primary">
                {i + 1}
              </span>
              <div className="min-w-0">
                {/* The everyday measure first ("½ gallon", owner 2026-10-16), the exact
                    amount under it. */}
                {s.measure ? (
                  <p className="font-display text-2xl leading-tight font-extrabold">{s.measure}</p>
                ) : null}
                <p className="font-semibold">{s.product}</p>
                {s.amount ? (
                  <p className="text-[0.9375rem] text-text-muted tabular-nums">About {s.amount}</p>
                ) : null}
                <p className="text-[0.9375rem] text-text-muted">{s.why}</p>
                {s.note ? <p className="mt-1 text-[0.9375rem]">{s.note}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
      {result.lsi !== null ? (
        <p className="mt-4 text-[0.9375rem]">
          Saturation index{" "}
          <span className="font-semibold tabular-nums">
            {result.lsi > 0 ? "+" : ""}
            {result.lsi.toFixed(1)}
          </span>{" "}
          · {result.lsiLabel}
        </p>
      ) : null}
    </>
  );
}

/** The pool the screen was opened for: Submit saves the readings to its log. */
export interface ChemicalPool {
  propertyId: string;
  jobId: string | null;
  name: string;
}

export function ChemCalculator({
  initialGallons,
  pool,
  inline = false,
}: {
  initialGallons?: number | null;
  pool?: ChemicalPool | null;
  /**
   * Inside the visit's Checklist (owner, 2026-10-19: "it should be a dropdown rather than its
   * own page"): one column, What to Add right under the readings, then Submit.
   */
  inline?: boolean;
}) {
  const [submitted, submit, submitting] = useActionState(submitReadings, {});
  const [gallonsText, setGallonsText] = useState(
    initialGallons ? withCommas(String(initialGallons)) : "",
  );
  const [values, setValues] = useState<Record<string, string>>({});
  // Levels to aim for instead of the recommended ones (owner, 2026-10-18: "chlorine won't
  // always be 4"). Empty uses the recommended level; this device remembers the rest.
  const [goals, setGoals] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(GOALS_KEY) ?? "{}");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount
      if (saved && typeof saved === "object") setGoals(saved as Record<string, string>);
    } catch {
      // Private browsing or blocked storage: start from the recommended levels.
    }
  }, []);
  const saveGoals = (next: Record<string, string>) => {
    setGoals(next);
    try {
      localStorage.setItem(GOALS_KEY, JSON.stringify(next));
    } catch {
      // Not remembered; still used for this visit.
    }
  };
  const [chlorine, setChlorine] = useState<ChlorineProduct>("liquid12");
  const [acid, setAcid] = useState<AcidProduct>("muriatic31");
  const [sheet, setSheet] = useState(false);
  const closeSheet = () => setSheet(false);

  // Pool size by gallons only (owner, 2026-10-16).
  const gallons = num(gallonsText) ?? 0;
  const readings: Readings = Object.fromEntries(
    READINGS.map((r) => [r.key, num(values[r.key] ?? "")]),
  );
  const goalLevels = Object.fromEntries(
    Object.entries(goals).map(([k, v]) => [k, num(v)]),
  ) as Partial<Record<ReadingKey, number | null>>;
  const recommended = targets(readings.cya);
  const result = calculateChemistry({
    gallons,
    readings,
    chlorine,
    acid,
    goals: goalLevels,
  });
  const anyGoal = Object.values(goalLevels).some((v) => v !== null);
  const ready = result.statuses.length > 0 && gallons > 0;
  const line = doseSummary(result, ready);

  if (inline) {
    return (
      <div className="space-y-4">
        <NumField
          label="Gallons"
          inputMode="numeric"
          value={gallonsText}
          onChange={(e) => setGallonsText(withCommas(e.target.value))}
          placeholder="20,000"
          unit="gal"
          className="max-w-xs"
        />
        {/* Each reading next to the level to aim for. Aim For shows the recommended level
              until the tech types their own. */}
        <div
          role="group"
          aria-label="Readings and levels to aim for"
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,5rem)_minmax(0,5rem)] items-center gap-x-2 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,6.5rem)_minmax(0,6.5rem)] sm:gap-x-3"
        >
          <span />
          <span className="text-right text-[0.8125rem] font-semibold text-text-muted uppercase">
            Reading
          </span>
          <span className="text-right text-[0.8125rem] font-semibold text-text-muted uppercase">
            Aim For
          </span>
          {READINGS.map((r) => {
            const key = r.key as ReadingKey;
            const target = recommended[key]?.target;
            return (
              <div key={r.key} className="contents">
                <span className="min-w-0 font-medium">
                  {r.label}
                  {r.hint ? (
                    <span className="text-[0.9375rem] font-normal text-text-muted"> {r.hint}</span>
                  ) : null}
                </span>
                <CellInput
                  label={`${r.label} reading`}
                  inputMode="decimal"
                  value={values[r.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [r.key]: e.target.value })}
                />
                {target != null ? (
                  <CellInput
                    label={`${r.label}: aim for (recommended ${target})`}
                    inputMode="decimal"
                    placeholder={String(target)}
                    value={goals[r.key] ?? ""}
                    onChange={(e) => saveGoals({ ...goals, [r.key]: e.target.value })}
                  />
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[0.9375rem] text-text-muted">
          Aim For starts at the recommended level. Type your own to dose to it.
          {anyGoal ? (
            <>
              {" "}
              <button
                type="button"
                onClick={() => saveGoals({})}
                className="min-h-11 font-semibold text-link"
              >
                Use Recommended
              </button>
            </>
          ) : null}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <Select
            label="Chlorine"
            value={chlorine}
            onChange={(e) => setChlorine(e.target.value as ChlorineProduct)}
            options={Object.entries(CHLORINE_PRODUCTS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <Select
            label="Acid"
            value={acid}
            onChange={(e) => setAcid(e.target.value as AcidProduct)}
            options={Object.entries(ACID_PRODUCTS).map(([value, label]) => ({ value, label }))}
          />
        </div>
        <section
            aria-labelledby="dose-inline-title"
            className="space-y-3 border-t-[0.5px] border-separator pt-4"
          >
          <h3 id="dose-inline-title" className="font-display text-lg font-bold">
            What to Add
          </h3>
          {ready ? (
            <Doses result={result} />
          ) : (
            <p className="text-text-muted">Add the gallons and a reading.</p>
          )}
        </section>
        {/* Submit: the left side goes into this pool's weekly log (owner, 2026-10-19). */}
        {pool ? (
          <form action={submit} className="space-y-3 border-t-[0.5px] border-separator pt-4">
            <input type="hidden" name="property" value={pool.propertyId} />
            <input type="hidden" name="job" value={pool.jobId ?? ""} />
            <input type="hidden" name="gallons" value={gallonsText} />
            <input type="hidden" name="chlorine" value={chlorine} />
            <input type="hidden" name="acid" value={acid} />
            {READINGS.map((r) => (
              <input key={r.key} type="hidden" name={r.key} value={values[r.key] ?? ""} />
            ))}
            <Button
              type="submit"
              disabled={submitting || result.statuses.length === 0}
              className="w-full sm:w-auto sm:px-8"
            >
              {submitting ? "Submitting…" : "Submit"}
            </Button>
            <p className="text-[0.9375rem] text-text-muted">
              Saves these readings to {pool.name}’s chemical log.
            </p>
            {submitted.error ? <Notice tone="error">{submitted.error}</Notice> : null}
            {submitted.message ? <Notice tone="success">{submitted.message}</Notice> : null}
          </form>
        ) : (
          <p className="border-t-[0.5px] border-separator pt-4 text-[0.9375rem] text-text-muted">
            To save readings to a pool’s log, open Chemical from a visit or the customer’s pool.
          </p>
        )}
      </div>
    );
  }

  return (
    // Readings fill the page. What to Add is a bar docked at the bottom that opens a sheet
    // (owner, 2026-10-16: "a pop up card from the bottom"); wide screens show it beside the
    // readings instead.
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-6">
        <section aria-labelledby="pool-title" className="card space-y-4 p-5">
          <h2 id="pool-title" className="font-display text-xl font-bold">
            Pool
          </h2>
          <NumField
            label="Gallons"
            inputMode="numeric"
            value={gallonsText}
            onChange={(e) => setGallonsText(withCommas(e.target.value))}
            placeholder="20,000"
            unit="gal"
            className="max-w-xs"
          />
        </section>

        <section aria-labelledby="readings-title" className="card space-y-4 p-5">
          <h2 id="readings-title" className="font-display text-xl font-bold">
            Readings
          </h2>
          {/* Each reading next to the level to aim for. Aim For shows the recommended level
              until the tech types their own. */}
          <div
            role="group"
            aria-label="Readings and levels to aim for"
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,5rem)_minmax(0,5rem)] items-center gap-x-2 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,6.5rem)_minmax(0,6.5rem)] sm:gap-x-3"
          >
            <span />
            <span className="text-right text-[0.8125rem] font-semibold text-text-muted uppercase">
              Reading
            </span>
            <span className="text-right text-[0.8125rem] font-semibold text-text-muted uppercase">
              Aim For
            </span>
            {READINGS.map((r) => {
              const key = r.key as ReadingKey;
              const target = recommended[key]?.target;
              return (
                <div key={r.key} className="contents">
                  <span className="min-w-0 font-medium">
                    {r.label}
                    {r.hint ? (
                      <span className="text-[0.9375rem] font-normal text-text-muted">
                        {" "}
                        {r.hint}
                      </span>
                    ) : null}
                  </span>
                  <CellInput
                    label={`${r.label} reading`}
                    inputMode="decimal"
                    value={values[r.key] ?? ""}
                    onChange={(e) => setValues({ ...values, [r.key]: e.target.value })}
                  />
                  {target != null ? (
                    <CellInput
                      label={`${r.label}: aim for (recommended ${target})`}
                      inputMode="decimal"
                      placeholder={String(target)}
                      value={goals[r.key] ?? ""}
                      onChange={(e) => saveGoals({ ...goals, [r.key]: e.target.value })}
                    />
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[0.9375rem] text-text-muted">
            Aim For starts at the recommended level. Type your own to dose to it.
            {anyGoal ? (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => saveGoals({})}
                  className="min-h-11 font-semibold text-link"
                >
                  Use Recommended
                </button>
              </>
            ) : null}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            <Select
              label="Chlorine"
              value={chlorine}
              onChange={(e) => setChlorine(e.target.value as ChlorineProduct)}
              options={Object.entries(CHLORINE_PRODUCTS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <Select
              label="Acid"
              value={acid}
              onChange={(e) => setAcid(e.target.value as AcidProduct)}
              options={Object.entries(ACID_PRODUCTS).map(([value, label]) => ({ value, label }))}
            />
          </div>
          {/* Submit: the left side goes into this pool's weekly log (owner, 2026-10-19). */}
          {pool ? (
            <form action={submit} className="space-y-3 border-t-[0.5px] border-separator pt-4">
              <input type="hidden" name="property" value={pool.propertyId} />
              <input type="hidden" name="job" value={pool.jobId ?? ""} />
              <input type="hidden" name="gallons" value={gallonsText} />
              <input type="hidden" name="chlorine" value={chlorine} />
              <input type="hidden" name="acid" value={acid} />
              {READINGS.map((r) => (
                <input key={r.key} type="hidden" name={r.key} value={values[r.key] ?? ""} />
              ))}
              <Button
                type="submit"
                disabled={submitting || result.statuses.length === 0}
                className="w-full sm:w-auto sm:px-8"
              >
                {submitting ? "Submitting…" : "Submit"}
              </Button>
              <p className="text-[0.9375rem] text-text-muted">
                Saves these readings to {pool.name}’s chemical log.
              </p>
              {submitted.error ? <Notice tone="error">{submitted.error}</Notice> : null}
              {submitted.message ? <Notice tone="success">{submitted.message}</Notice> : null}
            </form>
          ) : (
            <p className="border-t-[0.5px] border-separator pt-4 text-[0.9375rem] text-text-muted">
              To save readings to a pool’s log, open Chemical from a visit or the customer’s pool.
            </p>
          )}
        </section>
        {/* Room to scroll the last fields clear of the docked bar. */}
        <div aria-hidden="true" className="h-20 lg:hidden" />
      </div>

      <section aria-labelledby="dose-title" className="card p-5 max-lg:hidden lg:sticky lg:top-20">
        <h2 id="dose-title" className="mb-3 font-display text-xl font-bold">
          What to Add
        </h2>
        {ready ? (
          <Doses result={result} />
        ) : (
          <p className="text-text-muted">Add the gallons and a reading.</p>
        )}
      </section>

      {/* Phones and tablets: the docked bar, above the tab bar on phones. */}
      <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 px-3 sm:bottom-4 lg:hidden">
        <button
          type="button"
          onClick={() => setSheet(true)}
          disabled={!ready}
          aria-haspopup="dialog"
          className="glass mx-auto flex min-h-14 w-full max-w-xl items-center gap-3 rounded-[22px] px-4 py-2 text-left disabled:cursor-default"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[0.8125rem] font-semibold text-text-muted uppercase">
              What to Add
            </span>
            <span
              aria-live="polite"
              className={cx("block truncate font-semibold", !ready && "text-text-muted")}
            >
              {line}
            </span>
          </span>
          {ready ? <span className="shrink-0 font-semibold text-link">Show</span> : null}
        </button>
      </div>
      <Sheet open={sheet} onClose={closeSheet} title="What to Add" cancelLabel="Close">
        <Doses result={result} />
      </Sheet>
    </div>
  );
}
