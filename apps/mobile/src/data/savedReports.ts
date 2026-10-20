import { useMemo } from "react";
import { savedReportSections } from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { getServices } from "../lib/services";
import { useRows } from "./hooks";

// Saved reports (owner, 2026-10-20: "a copy/paste essentially that the tech uses each time"):
// a shop's own wording for a report's sections, word for word. Synced rows; the whole team
// reads them, owners and admins write them (supabase/migrations/20261012006200). The rules for
// using and saving them are shared with the website (packages/core report.ts).

export interface SavedReport {
  id: string;
  name: string;
  sections: unknown;
  sort_order: number | null;
  deleted_at?: string | null;
}

/** The shop's saved reports, not removed, in their order. */
export function useSavedReports(companyId: string): SavedReport[] {
  const rows = useRows<SavedReport>("saved_report", companyId);
  return useMemo(
    () =>
      rows
        .filter((r) => !r.deleted_at)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)),
    [rows],
  );
}

/** Adds a saved report at the end of the list. Returns its id. */
export function addSavedReport(companyId: string, name: string, sections: unknown): string {
  const { sync } = getServices();
  const last = sync
    .list("saved_report", companyId)
    .reduce((n, r) => Math.max(n, Number((r as { sort_order?: number }).sort_order ?? 0)), 0);
  return sync.insert("saved_report", companyId, {
    name: name.trim(),
    sections: savedReportSections(sections),
    sort_order: last + 1,
  });
}

export function updateSavedReport(companyId: string, id: string, name: string, sections: unknown) {
  getServices().sync.write("saved_report", id, companyId, {
    name: name.trim(),
    sections: savedReportSections(sections) as Record<string, JsonValue>,
  });
}

export function removeSavedReport(companyId: string, id: string) {
  getServices().sync.write("saved_report", id, companyId, {
    deleted_at: new Date().toISOString(),
  });
}
