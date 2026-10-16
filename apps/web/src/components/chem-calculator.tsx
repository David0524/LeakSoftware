"use client";

import { useState } from "react";
import {
  ACID_PRODUCTS,
  calculateChemistry,
  CHLORINE_PRODUCTS,
  poolGallons,
  type AcidProduct,
  type ChlorineProduct,
  type PoolShapeForVolume,
  type Readings,
  type Sanitizer,
  type Surface,
} from "@leakbook/core";
import { Segmented } from "./segmented";
import { cx, FieldGroup, GroupedField, GroupedSelect } from "./ui";

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
  { key: "cya", label: "Stabilizer", hint: "ppm (CYA)", step: "10" },
  { key: "salt", label: "Salt", hint: "ppm", step: "100" },
  { key: "tempF", label: "Water Temp", hint: "°F", step: "1" },
];

export function ChemCalculator({ initialGallons }: { initialGallons?: number | null }) {
  const [sizeBy, setSizeBy] = useState<"gallons" | "measure">(
    initialGallons ? "gallons" : "measure",
  );
  const [gallonsText, setGallonsText] = useState(initialGallons ? String(initialGallons) : "");
  const [shape, setShape] = useState<PoolShapeForVolume>("rectangle");
  const [dims, setDims] = useState({ length: "", width: "", shallow: "", deep: "" });
  const [surface, setSurface] = useState<Surface>("plaster");
  const [sanitizer, setSanitizer] = useState<Sanitizer>("chlorine");
  const [values, setValues] = useState<Record<string, string>>({});
  const [chlorine, setChlorine] = useState<ChlorineProduct>("liquid12");
  const [acid, setAcid] = useState<AcidProduct>("muriatic31");

  const measured = poolGallons(
    shape,
    num(dims.length) ?? 0,
    shape === "round" ? 0 : (num(dims.width) ?? 0),
    num(dims.shallow) ?? 0,
    num(dims.deep) ?? num(dims.shallow) ?? 0,
  );
  const gallons = sizeBy === "gallons" ? (num(gallonsText) ?? 0) : measured;
  const readings: Readings = Object.fromEntries(
    READINGS.map((r) => [r.key, num(values[r.key] ?? "")]),
  );
  const result = calculateChemistry({ gallons, surface, sanitizer, readings, chlorine, acid });
  const anyReading = result.statuses.length > 0;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-6">
        <section aria-labelledby="pool-title" className="card space-y-4 p-5">
          <h2 id="pool-title" className="font-display text-xl font-bold">
            Pool
          </h2>
          <Segmented
            label="Size"
            name="size_by"
            value={sizeBy}
            onChange={setSizeBy}
            options={[
              { value: "measure", label: "Measure" },
              { value: "gallons", label: "Gallons" },
            ]}
          />
          {sizeBy === "gallons" ? (
            <FieldGroup labelWidth="7rem">
              <GroupedField
                label="Gallons"
                inputMode="numeric"
                value={gallonsText}
                onChange={(e) => setGallonsText(e.target.value)}
                placeholder="20,000"
              />
            </FieldGroup>
          ) : (
            <>
              <Segmented
                label="Shape"
                name="shape"
                value={shape}
                onChange={setShape}
                options={[
                  { value: "rectangle", label: "Rectangle" },
                  { value: "kidney", label: "Kidney" },
                  { value: "oval", label: "Oval" },
                  { value: "round", label: "Round" },
                ]}
              />
              <FieldGroup labelWidth="7rem" className="grid gap-x-4 sm:grid-cols-2 sm:gap-y-4">
                <GroupedField
                  label={shape === "round" ? "Across (ft)" : "Length (ft)"}
                  inputMode="decimal"
                  value={dims.length}
                  onChange={(e) => setDims({ ...dims, length: e.target.value })}
                />
                {shape === "round" ? null : (
                  <GroupedField
                    label="Width (ft)"
                    inputMode="decimal"
                    value={dims.width}
                    onChange={(e) => setDims({ ...dims, width: e.target.value })}
                  />
                )}
                <GroupedField
                  label="Shallow (ft)"
                  inputMode="decimal"
                  value={dims.shallow}
                  onChange={(e) => setDims({ ...dims, shallow: e.target.value })}
                />
                <GroupedField
                  label="Deep (ft)"
                  inputMode="decimal"
                  value={dims.deep}
                  onChange={(e) => setDims({ ...dims, deep: e.target.value })}
                />
              </FieldGroup>
            </>
          )}
          <p className="text-[0.9375rem] text-text-muted" aria-live="polite" data-testid="gallons">
            {gallons > 0
              ? `About ${gallons.toLocaleString("en-US")} gallons`
              : "Enter the pool’s size."}
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-4">
            <Segmented
              label="Surface"
              name="surface"
              value={surface}
              onChange={setSurface}
              options={[
                { value: "plaster", label: "Plaster" },
                { value: "vinyl", label: "Vinyl" },
                { value: "fiberglass", label: "Fiberglass" },
              ]}
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
          </div>
        </section>

        <section aria-labelledby="readings-title" className="card space-y-4 p-5">
          <h2 id="readings-title" className="font-display text-xl font-bold">
            Readings
          </h2>
          <FieldGroup labelWidth="8.5rem" className="grid gap-x-4 sm:grid-cols-2 sm:gap-y-4">
            {READINGS.filter((r) => r.key !== "salt" || sanitizer === "salt").map((r) => (
              <GroupedField
                key={r.key}
                label={r.label}
                hint={r.hint || undefined}
                inputMode="decimal"
                value={values[r.key] ?? ""}
                onChange={(e) => setValues({ ...values, [r.key]: e.target.value })}
              />
            ))}
          </FieldGroup>
          <FieldGroup labelWidth="8.5rem" className="grid gap-x-4 sm:grid-cols-2 sm:gap-y-4">
            <GroupedSelect
              label="Chlorine"
              value={chlorine}
              onChange={(e) => setChlorine(e.target.value as ChlorineProduct)}
              options={Object.entries(CHLORINE_PRODUCTS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <GroupedSelect
              label="Acid"
              value={acid}
              onChange={(e) => setAcid(e.target.value as AcidProduct)}
              options={Object.entries(ACID_PRODUCTS).map(([value, label]) => ({ value, label }))}
            />
          </FieldGroup>
        </section>
      </div>

      <section
        aria-labelledby="dose-title"
        aria-live="polite"
        className="card p-5 lg:sticky lg:top-20"
      >
        <h2 id="dose-title" className="font-display text-xl font-bold">
          What to Add
        </h2>
        {!anyReading || gallons <= 0 ? (
          <p className="mt-2 text-text-muted">
            Enter the pool’s size and at least one reading to see how much to add.
          </p>
        ) : (
          <>
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Readings">
              {result.statuses.map((s) => (
                <li
                  key={s.key}
                  className={cx(
                    "rounded-full px-3 py-1 text-[0.9375rem] font-semibold",
                    s.status === "ok"
                      ? "bg-status-pass/12 text-status-pass"
                      : "bg-status-warning/12 text-status-warning",
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
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-link font-display font-bold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      {s.amount ? (
                        <p className="font-display text-2xl leading-tight font-extrabold tabular-nums">
                          {s.amount}
                        </p>
                      ) : null}
                      <p className="font-semibold">{s.product}</p>
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
            <p className="mt-4 text-[0.9375rem] text-text-muted">
              Amounts are starting points from standard dosing charts. Add in portions with the pump
              running, follow the product label, and retest.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
