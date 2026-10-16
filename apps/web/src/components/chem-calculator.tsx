"use client";

import { useId, useState, type ComponentProps } from "react";
import {
  ACID_PRODUCTS,
  calculateChemistry,
  doseSummary,
  CHLORINE_PRODUCTS,
  type AcidProduct,
  type ChemistryResult,
  type ChlorineProduct,
  type Readings,
  type Sanitizer,
  surfaceFor,
} from "@leakbook/core";
import { Segmented } from "./segmented";
import { Sheet } from "./sheet";
import { cx, Select } from "./ui";

// The pool chemical calculator (owner, 2026-10-16). Live: every change recalculates. Nothing is
// saved; it is a tool for the visit. The math is packages/core/src/chemistry.ts.

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
  { key: "salt", label: "Salt", hint: "ppm", step: "100" },
  { key: "tempF", label: "Water Temp", hint: "°F", step: "1" },
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

export function ChemCalculator({
  initialGallons,
  poolType,
}: {
  initialGallons?: number | null;
  /** The pool's recorded type, from a visit: it sets the calcium target. */
  poolType?: string | null;
}) {
  const [gallonsText, setGallonsText] = useState(
    initialGallons ? withCommas(String(initialGallons)) : "",
  );
  const surface = surfaceFor(poolType);
  const [sanitizer, setSanitizer] = useState<Sanitizer>("chlorine");
  const [values, setValues] = useState<Record<string, string>>({});
  const [chlorine, setChlorine] = useState<ChlorineProduct>("liquid12");
  const [acid, setAcid] = useState<AcidProduct>("muriatic31");
  const [sheet, setSheet] = useState(false);
  const closeSheet = () => setSheet(false);

  // Pool size by gallons only (owner, 2026-10-16).
  const gallons = num(gallonsText) ?? 0;
  const readings: Readings = Object.fromEntries(
    READINGS.map((r) => [r.key, num(values[r.key] ?? "")]),
  );
  const result = calculateChemistry({ gallons, surface, sanitizer, readings, chlorine, acid });
  const ready = result.statuses.length > 0 && gallons > 0;
  const line = doseSummary(result, ready);

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
          <Segmented
            label="Sanitizer"
            name="sanitizer"
            value={sanitizer}
            onChange={setSanitizer}
            options={[
              { value: "chlorine", label: "Chlorine" },
              { value: "salt", label: "Salt" },
            ]}
          />
        </section>

        <section aria-labelledby="readings-title" className="card space-y-4 p-5">
          <h2 id="readings-title" className="font-display text-xl font-bold">
            Readings
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {READINGS.filter((r) => r.key !== "salt" || sanitizer === "salt").map((r) => (
              <NumField
                key={r.key}
                label={r.label}
                unit={r.hint || undefined}
                inputMode="decimal"
                value={values[r.key] ?? ""}
                onChange={(e) => setValues({ ...values, [r.key]: e.target.value })}
              />
            ))}
          </div>
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
