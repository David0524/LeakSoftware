import { POOL_TYPE_LABELS, type Heater, type Property, type Sanitizer } from "./models";

/**
 * A pool's equipment on the customer's page (owner, 2026-11-16: "chlorine or salt pool, spa or
 * no spa, pool gallons, gate code, does it have heater, solar heater"). The pickers' choices, in
 * order, after "Not sure" (empty).
 */
export const SANITIZER_LABELS: Record<Sanitizer, string> = {
  chlorine: "Chlorine",
  salt: "Salt",
  bromine: "Bromine",
  other: "Other",
};

export const HEATER_LABELS: Record<Heater, string> = {
  none: "None",
  gas: "Gas",
  heat_pump: "Heat pump",
  electric: "Electric",
  other: "Other",
};

const SANITIZER_SUMMARY: Record<Sanitizer, string> = {
  chlorine: "Chlorine",
  salt: "Salt",
  bromine: "Bromine",
  other: "Other sanitizer",
};

const HEATER_SUMMARY: Record<Heater, string> = {
  none: "No heater",
  gas: "Gas heater",
  heat_pump: "Heat pump",
  electric: "Electric heater",
  other: "Other heater",
};

export type PoolSummaryInput = Pick<Property, "has_spa"> &
  Partial<
    Pick<Property, "pool_type" | "approx_gallons" | "sanitizer" | "heater" | "has_solar_heater">
  >;

/**
 * The pool's line under its address on the customer's and job's pages: "Gunite / plaster · Pool
 * and spa · 20,000 gallons · Salt · Gas heater · Solar heater". What isn't known is left out.
 */
export function poolSummary(p: PoolSummaryInput): string {
  const known = <K extends string>(map: Record<K, string>, v: string | null | undefined) =>
    v && v in map ? map[v as K] : null;
  return [
    known(POOL_TYPE_LABELS, p.pool_type),
    p.has_spa ? "Pool and spa" : "Pool",
    p.approx_gallons ? `${Math.round(p.approx_gallons).toLocaleString("en-US")} gallons` : null,
    known(SANITIZER_SUMMARY, p.sanitizer),
    known(HEATER_SUMMARY, p.heater),
    p.has_solar_heater ? "Solar heater" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
