import { formatAddress, propertyLocation, type Property } from "@leakbook/core";

// Pools not on the map (owner, 2026-10-20): Today and Schedule look up, in the background, the
// pools of the stops in view that have an address but no map location, as the website's
// schedule does: at most ten per load, never one already tried at this address (the server keeps
// `geocoded_address` for a miss too), and each pool at most once per app session. Pure, so it's
// tested without a phone.

export const LOOKUPS_PER_LOAD = 10;

/** The pools to look up now, in the order given (the day's stops first), at most ten. */
export function poolsToLocate(
  pools: (Property | null | undefined)[],
  tried: ReadonlySet<string>,
  limit = LOOKUPS_PER_LOAD,
): Property[] {
  const out = new Map<string, Property>();
  for (const p of pools) {
    if (out.size >= limit) break;
    if (!p || out.has(p.id) || tried.has(p.id) || p.deleted_at) continue;
    if (!p.address_line1?.trim() || propertyLocation(p)) continue;
    if (p.geocoded_address === formatAddress(p)) continue;
    out.set(p.id, p);
  }
  return [...out.values()];
}
