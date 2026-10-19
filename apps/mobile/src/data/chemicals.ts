import { useMemo } from "react";
import type { ChemicalReading } from "@leakbook/core";
import { useRows } from "./hooks";

type Row = ChemicalReading & { deleted_at?: string | null };

/**
 * The shop's chemical log on this phone (owner, 2026-10-19): every pool's submitted readings,
 * newest first, removed ones left out. Table `chemical_reading`.
 */
export function useChemicalLog(companyId: string): ChemicalReading[] {
  const rows = useRows<Row>("chemical_reading", companyId);
  return useMemo(
    () =>
      rows
        .filter((r) => !r.deleted_at)
        .sort((a, b) =>
          a.recorded_at < b.recorded_at ? 1 : a.recorded_at > b.recorded_at ? -1 : 0,
        ),
    [rows],
  );
}

/** Each pool's latest entry, by property id. */
export function latestByPool(log: ChemicalReading[]): Map<string, ChemicalReading> {
  const latest = new Map<string, ChemicalReading>();
  for (const r of log) if (!latest.has(r.property_id)) latest.set(r.property_id, r);
  return latest;
}
