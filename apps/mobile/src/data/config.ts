import { useMemo } from "react";
import { configKey } from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { getServices } from "../lib/services";
import { useRows } from "./hooks";

// The shop's lists techs' work depends on (Settings, spec 5.12): price book, checklist
// components, test types, severities, exclusion reasons. They are synced rows; managers change
// them through the sync layer, as the website's settings actions do.

export type ConfigTable =
  "price_book_item" | "component_type" | "test_type" | "severity_level" | "exclusion_reason";

/** A table's rows, not removed, in their order. */
export function useConfig<T extends { sort_order?: number | null }>(
  table: ConfigTable,
  companyId: string,
): T[] {
  const rows = useRows<T & { deleted_at?: string | null }>(table, companyId);
  return useMemo(
    () =>
      rows.filter((r) => !r.deleted_at).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [rows],
  );
}

/**
 * Save a row: `id` updates it; without one a new row is added, keyed from its name when the
 * table has keys (`keyFrom`). Returns the row's id.
 */
export function saveConfig(
  table: ConfigTable,
  companyId: string,
  id: string | null,
  values: Record<string, JsonValue>,
  keyFrom?: string,
): string {
  const { sync } = getServices();
  if (id) {
    sync.write(table, id, companyId, values);
    return id;
  }
  const extra: Record<string, JsonValue> = {};
  if (keyFrom !== undefined) {
    const taken = sync.list(table, companyId).map((r) => String((r as { key?: string }).key ?? ""));
    extra.key = configKey(keyFrom, taken);
  }
  return sync.insert(table, companyId, { ...values, ...extra });
}

/** Remove a row (kept for history; it stops being offered). */
export function removeConfig(table: ConfigTable, companyId: string, id: string) {
  getServices().sync.write(table, id, companyId, { deleted_at: new Date().toISOString() });
}

/** "12" → 12; anything else → the fallback. */
export function toInt(text: string, fallback = 0): number {
  const n = Number.parseInt(text.trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}
