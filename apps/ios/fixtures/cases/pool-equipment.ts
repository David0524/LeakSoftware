import {
  HEATER_LABELS,
  SANITIZER_LABELS,
  poolSummary,
  type PoolSummaryInput,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// pool-equipment.ts: sanitizer, heater and solar heater on the pool (owner, 2026-11-16).
export const poolEquipment: ModuleCases = {
  SANITIZER_LABELS: rule(() => SANITIZER_LABELS, [[]]),
  HEATER_LABELS: rule(() => HEATER_LABELS, [[]]),
  poolSummary: rule(
    (p: PoolSummaryInput) => poolSummary(p),
    [
      [
        {
          pool_type: "gunite_plaster",
          has_spa: true,
          approx_gallons: 20000,
          sanitizer: "salt",
          heater: "gas",
          has_solar_heater: true,
        },
      ],
      [{ has_spa: false }],
      [{ has_spa: false, approx_gallons: 12500.4, sanitizer: "chlorine", heater: "heat_pump" }],
      [{ pool_type: "vinyl", has_spa: false, sanitizer: "other", heater: "none" }],
      [{ has_spa: true, sanitizer: "bromine", heater: "electric", has_solar_heater: false }],
      [{ has_spa: false, heater: "other", has_solar_heater: true }],
    ],
  ),
};
