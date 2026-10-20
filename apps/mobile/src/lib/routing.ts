import { useEffect, useSyncExternalStore } from "react";
import { API_URL } from "./config";
import { useCompany } from "../state/session";
import { getServices } from "./services";

// Whether the shop's address lookups are set up, for the "Not found on the map" warning (owner,
// 2026-10-20; core mapStatus). The website knows from its routing key; the phone can't see it,
// so lookups count as on when the shop is on the map, or when /api/locate answers anything but
// 503 ("Address lookup isn't set up"). Asked once per app run, remembered for offline use; with
// no answer yet the warning stays hidden.

const KEY = "routing:configured";
const listeners = new Set<() => void>();
let asked = false;

function read(): string | null {
  try {
    return getServices().kv.get(KEY);
  } catch {
    return null;
  }
}

/** Ask the server once: a request naming no pool gets 400 when lookups work, 503 when not. */
async function probe(companyId: string) {
  if (asked || !API_URL) return;
  asked = true;
  try {
    const { sync, kv } = getServices();
    const token = await sync.accessToken();
    if (!token) return void (asked = false);
    const res = await fetch(`${API_URL}/api/locate`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ company_id: companyId }),
    });
    if (res.status === 401 || res.status === 403) return void (asked = false);
    kv.set(KEY, res.status === 503 ? "0" : "1");
    for (const fn of listeners) fn();
  } catch {
    asked = false; // Offline: ask again next time.
  }
}

/** Whether address lookups are set up for this shop (see above). */
export function useRoutingOn(): boolean {
  const company = useCompany() as unknown as {
    id: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  const saved = useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, read);
  useEffect(() => {
    void probe(company.id);
  }, [company.id]);
  return (company.latitude != null && company.longitude != null) || saved === "1";
}
