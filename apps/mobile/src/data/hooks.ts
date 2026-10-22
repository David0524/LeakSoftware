import { useMemo, useState, useSyncExternalStore } from "react";
import type { Row } from "@leakbook/sync";
import { getServices } from "../lib/services";
import type { SyncStatus } from "../lib/sync-service";

/** Re-render when local data changes (local edits or pulled rows). */
export function useSyncStatus(): SyncStatus {
  const { sync } = getServices();
  return useSyncExternalStore(sync.subscribe, () => sync.status);
}

/**
 * Re-render when this table's rows change. Components using several tables re-render for
 * any of them, but not for edits elsewhere: a checklist tap no longer re-reads every job.
 */
function useTableVersion(table: string): string {
  const { sync } = getServices();
  return useSyncExternalStore(sync.subscribe, () => sync.tableVersion(table));
}

/** Non-deleted rows of a table, optionally for one company. */
export function useRows<T>(table: string, companyId?: string): T[] {
  const version = useTableVersion(table);
  return useMemo(
    () => getServices().sync.list(table, companyId) as unknown as T[],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version signals data changes
    [table, companyId, version],
  );
}

/**
 * One job's rows of a table (checklist, photos, findings, ...). Reads through the job index,
 * so a job screen stays quick with thousands of jobs on the phone (M11).
 */
export function useJobRows<T>(table: string, companyId: string, jobId: string): T[] {
  const version = useTableVersion(table);
  return useMemo(
    () => getServices().sync.list(table, companyId, jobId) as unknown as T[],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version signals data changes
    [table, companyId, jobId, version],
  );
}

/** One job's rows of a table, removed ones too (a job's repairs: packages/core repairs.ts). */
export function useJobRowsWithRemoved<T>(table: string, companyId: string, jobId: string): T[] {
  const version = useTableVersion(table);
  return useMemo(
    () => getServices().sync.list(table, companyId, jobId, true) as unknown as T[],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version signals data changes
    [table, companyId, jobId, version],
  );
}

export function useRow<T>(table: string, id: string | undefined): T | undefined {
  const version = useTableVersion(table);
  return useMemo(
    () => (id ? (getServices().sync.get<Row>(table, id) as unknown as T | undefined) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version signals data changes
    [table, id, version],
  );
}

/** Pull to refresh on a synced list: syncs now (the rows update as they arrive). */
export function useSyncRefresh(): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  return {
    refreshing,
    onRefresh: () => {
      setRefreshing(true);
      void getServices()
        .sync.syncNow()
        .catch(() => undefined)
        .finally(() => setRefreshing(false));
    },
  };
}

/**
 * True until this sign-in's first download has finished and nothing is on the phone yet: the
 * screens show placeholder cards instead of an empty state (owner, 2026-10-20). Re-renders only
 * when that changes, not on every sync step.
 */
export function useFirstLoad(hasRows: boolean): boolean {
  const { sync } = getServices();
  const done = useSyncExternalStore(sync.subscribe, () => sync.status.initialSyncDone);
  return !done && !hasRows;
}
