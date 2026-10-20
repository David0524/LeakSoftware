import { useEffect } from "react";
import type { Property } from "@leakbook/core";
import { API_URL } from "./config";
import { poolsToLocate } from "./locateMissing";
import { getServices } from "./services";

// A new address drops the old map location in the same write (property or company); once the
// write reaches the server, the website finds the new one from the address (POST /api/locate),
// and it syncs back. Offline or before the write is up, the next route plan finds it instead.

export type LocateTarget = { property_id: string } | { shop: true };

/** Push the address change, then ask the server to place it on the map. Never throws. */
export async function locateAfterSync(companyId: string, target: LocateTarget): Promise<void> {
  if (!API_URL) return;
  const { sync } = getServices();
  try {
    await sync.syncNow();
    const table = "property_id" in target ? "property" : "company";
    const id = "property_id" in target ? target.property_id : companyId;
    if (sync.hasPendingWrites(table, id)) return;
    const token = await sync.accessToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/locate`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ company_id: companyId, ...target }),
    });
    if (res.ok) await sync.syncNow();
  } catch {
    // Offline: the next route plan finds it from the address.
  }
}

/** Pools looked up this app session (found or not), and whether lookups answered "not set up". */
const tried = new Set<string>();
let lookupsOff = false;

/**
 * Today and Schedule: look up, in the background, the pools in view that have an address but
 * no map location (owner, 2026-10-20: "Pools not on the map"), at most ten per load and each
 * once per app session, as the website's schedule does. Found locations come back by sync.
 * Never throws; nothing on screen waits for it.
 */
export function useLocateMissing(companyId: string, pools: (Property | null | undefined)[]) {
  const due = lookupsOff || !API_URL ? [] : poolsToLocate(pools, tried);
  const key = due.map((p) => p.id).join(",");
  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    for (const id of ids) tried.add(id);
    void (async () => {
      try {
        const { sync } = getServices();
        const token = await sync.accessToken();
        if (!token) {
          for (const id of ids) tried.delete(id);
          return;
        }
        let found = false;
        for (const id of ids) {
          // A pool with an address change still on its way up is placed by that change.
          if (sync.hasPendingWrites("property", id)) continue;
          const res = await fetch(`${API_URL}/api/locate`, {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({ company_id: companyId, property_id: id }),
          });
          if (res.status === 503) {
            lookupsOff = true;
            return;
          }
          if (res.ok) found = true;
        }
        if (found) await sync.syncNow();
      } catch {
        // Offline: let the next load try these again.
        for (const id of ids) tried.delete(id);
      }
    })();
  }, [companyId, key]);
}
