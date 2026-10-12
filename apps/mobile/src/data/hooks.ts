import { useMemo, useSyncExternalStore } from "react";
import type { Row } from "@leakbook/sync";
import { getServices } from "../lib/services";
import type { SyncStatus } from "../lib/sync-service";

/** Re-render when local data changes (local edits or pulled rows). */
export function useDataVersion(): number {
  const { sync } = getServices();
  return useSyncExternalStore(sync.subscribe, () => sync.version);
}

export function useSyncStatus(): SyncStatus {
  const { sync } = getServices();
  return useSyncExternalStore(sync.subscribe, () => sync.status);
}

/** Non-deleted rows of a table, optionally for one company. */
export function useRows<T>(table: string, companyId?: string): T[] {
  const version = useDataVersion();
  return useMemo(
    () => getServices().sync.list(table, companyId) as unknown as T[],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version signals data changes
    [table, companyId, version],
  );
}

export function useRow<T>(table: string, id: string | undefined): T | undefined {
  const version = useDataVersion();
  return useMemo(
    () => (id ? (getServices().sync.get<Row>(table, id) as unknown as T | undefined) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version signals data changes
    [table, id, version],
  );
}
