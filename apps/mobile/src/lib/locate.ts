import { API_URL } from "./config";
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
